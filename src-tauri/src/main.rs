#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]
mod vault;
use std::{fs, path::PathBuf, sync::Mutex};
use tauri::{AppHandle, Manager, State};
use vault::{MasterKey, VaultFile};

#[derive(Default)]
struct Session(Mutex<Option<(VaultFile, MasterKey)>>);

fn e<T: ToString>(x: T) -> String { x.to_string() }
fn vpath(app: &AppHandle) -> Result<PathBuf, String> {
    let d = app.path().app_data_dir().map_err(e)?;
    fs::create_dir_all(&d).map_err(e)?;
    Ok(d.join("vault.json"))
}
fn persist(app: &AppHandle, f: &VaultFile) -> Result<(), String> {
    let p = vpath(app)?;
    if p.exists() { let _ = fs::copy(&p, p.with_extension("bak")); }
    let t = p.with_extension("tmp");
    fs::write(&t, serde_json::to_vec(f).map_err(e)?).map_err(e)?;
    fs::rename(&t, &p).map_err(e)
}
fn load(app: &AppHandle) -> Result<VaultFile, String> {
    let b = fs::read(vpath(app)?).map_err(|_| "No vault found".to_string())?;
    serde_json::from_slice(&b).map_err(|_| "Vault file is damaged".to_string())
}
fn check_len(p: &str) -> Result<(), String> {
    if p.chars().count() < 10 { Err("Use at least 10 characters.".into()) } else { Ok(()) }
}
fn text(d: Vec<u8>) -> Result<String, String> { String::from_utf8(d).map_err(|_| "Data is damaged".to_string()) }

#[tauri::command]
fn status(app: AppHandle) -> &'static str {
    if vpath(&app).map(|p| p.exists()).unwrap_or(false) { "locked" } else { "new" }
}
#[tauri::command]
fn create_vault(app: AppHandle, s: State<Session>, password: String, data: String) -> Result<String, String> {
    check_len(&password)?;
    if vpath(&app)?.exists() { return Err("A vault already exists on this device.".into()); }
    let (f, m, rec) = vault::create(&password, data.as_bytes())?;
    persist(&app, &f)?;
    *s.0.lock().unwrap() = Some((f, m));
    Ok(rec)
}
#[tauri::command]
fn unlock(app: AppHandle, s: State<Session>, password: String) -> Result<String, String> {
    let f = load(&app)?;
    let (m, d) = vault::unlock(&f, &password)?;
    *s.0.lock().unwrap() = Some((f, m));
    text(d)
}
#[tauri::command]
fn recover(app: AppHandle, s: State<Session>, recovery: String, password: String) -> Result<String, String> {
    check_len(&password)?;
    let mut f = load(&app)?;
    let (m, d) = vault::unlock_rec(&f, &recovery)?;
    vault::set_password(&mut f, &m, &password)?;
    persist(&app, &f)?;
    *s.0.lock().unwrap() = Some((f, m));
    text(d)
}
#[tauri::command]
fn save(app: AppHandle, s: State<Session>, data: String) -> Result<(), String> {
    let mut g = s.0.lock().unwrap();
    let (f, m) = g.as_mut().ok_or("Locked")?;
    vault::reseal(f, m, data.as_bytes())?;
    persist(&app, f)
}
#[tauri::command]
fn change_password(app: AppHandle, s: State<Session>, old_password: String, new_password: String) -> Result<(), String> {
    check_len(&new_password)?;
    let mut g = s.0.lock().unwrap();
    let (f, m) = g.as_mut().ok_or("Locked")?;
    let _ = vault::unlock(f, &old_password)?;
    vault::set_password(f, m, &new_password)?;
    persist(&app, f)
}
#[tauri::command]
fn lock(s: State<Session>) { *s.0.lock().unwrap() = None; }

fn main() {
    tauri::Builder::default()
        .manage(Session::default())
        .invoke_handler(tauri::generate_handler![status, create_vault, unlock, recover, save, change_password, lock])
        .run(tauri::generate_context!())
        .expect("error while running Reflecting");
}
