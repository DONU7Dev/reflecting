// Encryption core. A random master key encrypts the data (XChaCha20-Poly1305).
// The master key is itself locked twice: by the password (Argon2id) and by a recovery key.
// Changing the password only re-locks the master key, so security is unchanged.
use argon2::{Algorithm, Argon2, Params, Version};
use base64::{engine::general_purpose::STANDARD as B64, Engine};
use chacha20poly1305::{aead::{Aead, KeyInit}, XChaCha20Poly1305, XNonce};
use data_encoding::BASE32_NOPAD;
use rand::{rngs::OsRng, RngCore};
use serde::{Deserialize, Serialize};
use zeroize::Zeroizing;

pub type MasterKey = Zeroizing<[u8; 32]>;
type E = String;

#[derive(Serialize, Deserialize, Clone)]
pub struct Blob { n: String, c: String }
#[derive(Serialize, Deserialize, Clone)]
pub struct VaultFile { v: u8, salt: String, pw: Blob, rec: Blob, data: Blob }

fn rb<const N: usize>() -> [u8; N] { let mut b = [0u8; N]; OsRng.fill_bytes(&mut b); b }
fn err(m: &str) -> E { m.to_string() }

fn seal(key: &[u8; 32], pt: &[u8]) -> Result<Blob, E> {
    let n = rb::<24>();
    let c = XChaCha20Poly1305::new(chacha20poly1305::Key::from_slice(key))
        .encrypt(XNonce::from_slice(&n), pt).map_err(|_| err("Encryption failed"))?;
    Ok(Blob { n: B64.encode(n), c: B64.encode(c) })
}
fn open(key: &[u8; 32], b: &Blob) -> Result<Vec<u8>, E> {
    let n = B64.decode(&b.n).map_err(|_| err("Vault file is damaged"))?;
    let c = B64.decode(&b.c).map_err(|_| err("Vault file is damaged"))?;
    if n.len() != 24 { return Err(err("Vault file is damaged")); }
    XChaCha20Poly1305::new(chacha20poly1305::Key::from_slice(key))
        .decrypt(XNonce::from_slice(&n), c.as_ref()).map_err(|_| err("Incorrect password or recovery key"))
}
fn kdf(pw: &str, salt: &[u8]) -> Result<MasterKey, E> {
    let p = Params::new(65536, 3, 1, Some(32)).map_err(|e| e.to_string())?;
    let mut out = Zeroizing::new([0u8; 32]);
    Argon2::new(Algorithm::Argon2id, Version::V0x13, p)
        .hash_password_into(pw.as_bytes(), salt, &mut *out).map_err(|e| e.to_string())?;
    Ok(out)
}
fn to_key(v: Vec<u8>) -> Result<MasterKey, E> {
    let a: [u8; 32] = v.try_into().map_err(|_| err("Vault file is damaged"))?; Ok(Zeroizing::new(a))
}
fn fmt_rec(b: &[u8; 32]) -> String {
    BASE32_NOPAD.encode(b).as_bytes().chunks(4).map(|c| String::from_utf8_lossy(c).to_string()).collect::<Vec<_>>().join("-")
}
fn parse_rec(s: &str) -> Result<MasterKey, E> {
    let t: String = s.chars().filter(|c| c.is_ascii_alphanumeric()).collect::<String>().to_uppercase();
    to_key(BASE32_NOPAD.decode(t.as_bytes()).map_err(|_| err("Invalid recovery key"))?)
}
fn salt_of(f: &VaultFile) -> Result<Vec<u8>, E> { B64.decode(&f.salt).map_err(|_| err("Vault file is damaged")) }

pub fn create(pw: &str, data: &[u8]) -> Result<(VaultFile, MasterKey, String), E> {
    let master = Zeroizing::new(rb::<32>());
    let rec = Zeroizing::new(rb::<32>());
    let salt = rb::<16>();
    let pk = kdf(pw, &salt)?;
    let f = VaultFile { v: 1, salt: B64.encode(salt), pw: seal(&pk, &master[..])?, rec: seal(&rec, &master[..])?, data: seal(&master, data)? };
    Ok((f, master, fmt_rec(&rec)))
}
pub fn unlock(f: &VaultFile, pw: &str) -> Result<(MasterKey, Vec<u8>), E> {
    let pk = kdf(pw, &salt_of(f)?)?;
    let m = to_key(open(&pk, &f.pw)?)?;
    let d = open(&m, &f.data)?;
    Ok((m, d))
}
pub fn unlock_rec(f: &VaultFile, rec: &str) -> Result<(MasterKey, Vec<u8>), E> {
    let rk = parse_rec(rec)?;
    let m = to_key(open(&rk, &f.rec)?)?;
    let d = open(&m, &f.data)?;
    Ok((m, d))
}
pub fn reseal(f: &mut VaultFile, m: &MasterKey, data: &[u8]) -> Result<(), E> { f.data = seal(m, data)?; Ok(()) }
pub fn set_password(f: &mut VaultFile, m: &MasterKey, new_pw: &str) -> Result<(), E> {
    let salt = rb::<16>();
    let pk = kdf(new_pw, &salt)?;
    f.salt = B64.encode(salt);
    f.pw = seal(&pk, &m[..])?;
    Ok(())
}
