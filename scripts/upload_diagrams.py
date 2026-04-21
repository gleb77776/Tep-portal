#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Скрипт переноса PID-схем в SharePoint и в папку нового портала TepPortal.
Запуск: python upload_diagrams.py [--local] [nd] [--sync-titles]
  --local, -l  — только копирование в data/diagrams (без SharePoint, для localhost)
  nd           — не удалять файлы перед загрузкой (no delete)
  --sync-titles — только обновить diagram_titles.json из DIAGRAMSLIST.log для уже лежащих PDF (без SharePoint)

Подпапка проекта в data/diagrams выбирается по номеру из названия (ведущие цифры / 261N1 и т.д.),
чтобы не плодить дубликаты при разных языках названия в логе PDMS. Дата выгрузки на портал
пишется в diagram_pdms_at.json и показывается в списке диаграмм.
"""

import os
import re
import sys
import json
import glob
import shutil
import logging
import base64
import requests
import time
import subprocess
from urllib.parse import quote
from requests_ntlm import HttpNtlmAuth
from datetime import datetime, timezone

# Импорт конфига (создайте config.py из config.example.py)
try:
    from config import USERNAME, PASSWORD, TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID
except ImportError:
    USERNAME = os.environ.get("DIAGRAMS_USERNAME", "")
    PASSWORD = os.environ.get("DIAGRAMS_PASSWORD", "")
    TELEGRAM_BOT_TOKEN = os.environ.get("TELEGRAM_BOT_TOKEN", "")
    TELEGRAM_CHAT_ID = os.environ.get("TELEGRAM_CHAT_ID", "")

# -------------------------------------------------------------------------
# Константы
# -------------------------------------------------------------------------
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.dirname(SCRIPT_DIR)

_DEFAULT_DIAGRAMS_LIST = r"\\tep-m.ru\data\App\PDMS\PDMS_TEP\LOG\DIAGRAMSLIST.log"
DIAGRAMS_LIST = os.environ.get("DIAGRAMS_LIST_PATH", _DEFAULT_DIAGRAMS_LIST)
ENUMS_LIST = r"\\tep-m.ru\data\App\PDMS\PDMS_TEP\LOG\ENUMSLIST.log"

SHAREPOINT_SITE = "http://tepmsp11"
PROJECTS_BASE_URL = "http://tepmsp11/Projects"
PROJECTS_BASE_PATH = r"\\tepmsp11\Projects"

# Папка для нового портала TepPortal (data/diagrams)
NEW_PORTAL_DIAGRAMS_PATH = os.path.join(PROJECT_ROOT, "data", "diagrams")

PID_DIR_NAME = "PID схемы"

DIAGRAM_PDMS_AT_FILENAME = "diagram_pdms_at.json"

# Чтобы не заспамливать лог при --sync-titles (много строк с одним проектом)
_warned_ambiguous_folder_keys = set()

FULL_LOG_NAME = rf"\\tep-m.ru\data\App\PDMS\PDMS_TEP\LOG\DIAGRAMSLIST_{datetime.now():%d.%m.%y}.log"
DEBUG_LOG_NAME = rf"\\tep-m.ru\data\App\PDMS\PDMS_TEP\LOG\DIAGRAMSLIST_DEBUG_{datetime.now():%d.%m.%y}.log"
LOCAL_LOG_DIR = os.path.join(SCRIPT_DIR, "logs")
LOCAL_FULL_LOG = os.path.join(LOCAL_LOG_DIR, f"diagrams_{datetime.now():%Y%m%d}.log")
LOCAL_DEBUG_LOG = os.path.join(LOCAL_LOG_DIR, f"diagrams_debug_{datetime.now():%Y%m%d}.log")

# UYK 261N1
UYK_DIAGRAMS_ROOT = r"\\tep-m.ru\data\App\PDMS\PDMS_TEP\PROJECTS\E3D\UYK\uykdia"
UYK_PROJECT_IDENTIFIER = "UYK 261N1"

# Особые проекты: в логе путь в поле 3 часто не совпадает с реальным каталогом выгрузки;
# источник — последняя папка ДД_ММ_ГГГГ под корнем (как в SharePoint-скрипте).
_SVB_ROOT_SENTINEL = object()

SVB_ROOT_CANDIDATES = [
    r"X:\App\PDMS\PDMS_TEP\PROJECTS\E3D\SVB\svbdia",
    r"\\tep-m.ru\data\App\PDMS\PDMS_TEP\PROJECTS\E3D\SVB\svbdia",
]

SVB_CANONICAL_KEY = "141N50 Svobodnenskaya"

SPECIAL_DIAGRAM_ROOTS = {
    UYK_PROJECT_IDENTIFIER: UYK_DIAGRAMS_ROOT,
    SVB_CANONICAL_KEY: _SVB_ROOT_SENTINEL,
    "Динская ТЭС": r"\\tep-m.ru\data\App\PDMS\PDMS_TEP\PROJECTS\E3D\DNS\dnsdia",
    "ТЭЦ-26": r"\\tep-m.ru\data\App\PDMS\PDMS_TEP\PROJECTS\E3D\WXT\wxtdia",
}

# Имя первого поля в логе → каноническое имя папки (как на SharePoint / в data/diagrams)
SHAREPOINT_PROJECT_FOLDER_OVERRIDES = {
    SVB_CANONICAL_KEY: "141N50 Svobodnenskaya",
    "Свободненская ТЭС": "141N50 Svobodnenskaya",
    "Свободинская ТЭС": "141N50 Svobodnenskaya",
}


def resolve_diagram_root(proj_key, root_value):
    if root_value is _SVB_ROOT_SENTINEL:
        for path in SVB_ROOT_CANDIDATES:
            if os.path.exists(path):
                log(f"Корень SVB («{proj_key}»): {path}", level=logging.INFO)
                return path
        log(f"[ERR] Корень SVB не найден: {SVB_ROOT_CANDIDATES}", level=logging.ERROR)
        return None
    return root_value


def special_project_key(project_name):
    """Ключ из SPECIAL_DIAGRAM_ROOTS для особого проекта (синонимы в 1-м поле лога)."""
    pn = project_name.strip()
    pl = pn.lower()

    if ("141n50" in pl and "svobod" in pl) or ("svobodnenskaya" in pl):
        return SVB_CANONICAL_KEY
    if "свободненская" in pl and "тэс" in pl:
        return SVB_CANONICAL_KEY
    if "свободинская" in pl and "тэс" in pl:
        return SVB_CANONICAL_KEY

    for key in sorted(SPECIAL_DIAGRAM_ROOTS.keys(), key=len, reverse=True):
        ks = key.strip()
        if ks.lower() in pl:
            return key
    return None


def canonical_portal_folder_name(project_name_from_log):
    """Имя папки проекта до sanitize (совпадает с подпапкой на SharePoint)."""
    name = project_name_from_log.strip()
    nl = name.lower()
    for key in sorted(SHAREPOINT_PROJECT_FOLDER_OVERRIDES.keys(), key=len, reverse=True):
        if key.lower() in nl:
            return SHAREPOINT_PROJECT_FOLDER_OVERRIDES[key]
    return name


def portal_diagrams_subdir(project_name_from_log):
    """Имя каталога в data/diagrams (безопасное)."""
    return re.sub(r"[^\w\-]", "_", canonical_portal_folder_name(project_name_from_log))


def list_existing_portal_diagram_dirs():
    """Имена существующих подпапок в data/diagrams."""
    if not os.path.isdir(NEW_PORTAL_DIAGRAMS_PATH):
        return []
    out = []
    try:
        for name in os.listdir(NEW_PORTAL_DIAGRAMS_PATH):
            p = os.path.join(NEW_PORTAL_DIAGRAMS_PATH, name)
            if os.path.isdir(p):
                out.append(name)
    except OSError:
        pass
    return out


def extract_project_match_keys(project_name):
    """Ключи от более специфичного к общему (номер проекта из поля лога)."""
    s = project_name.strip()
    keys = []
    m = re.match(r"^(\d+N\d+)", s, re.I)
    if m:
        keys.append(m.group(1))
    m2 = re.match(r"^(\d+)", s)
    if m2:
        d = m2.group(1)
        if d not in keys:
            keys.append(d)
    return keys


def dir_matches_project_key(dir_name, key):
    """Совпадение имени папки с ключом номера проекта."""
    if dir_name == key:
        return True
    if dir_name.startswith(key + "_"):
        return True
    if key.isdigit() and re.match(r"^" + re.escape(key) + r"N\d", dir_name, re.I):
        return True
    return False


def _count_files_in_diagram_dir(dir_name):
    base = os.path.join(NEW_PORTAL_DIAGRAMS_PATH, dir_name)
    try:
        return sum(
            1
            for n in os.listdir(base)
            if os.path.isfile(os.path.join(base, n))
            and n not in ("diagram_titles.json", "diagram_titles.local.json", DIAGRAM_PDMS_AT_FILENAME)
        )
    except OSError:
        return 0


def pick_canonical_dir(candidates):
    """При нескольких кандидатах с одним номером — папка с большим числом файлов (основной проект)."""
    if not candidates:
        return ""
    if len(candidates) == 1:
        return candidates[0]
    return max(candidates, key=lambda d: (_count_files_in_diagram_dir(d), len(d), d))


def resolve_portal_diagram_folder(project_name_from_log, existing_dirs):
    """
    Итоговое имя подпапки в data/diagrams: привязка к уже существующей папке по номеру проекта,
    чтобы русское и английское название в логе не создавали две папки.
    """
    sk = special_project_key(project_name_from_log)
    if sk is not None:
        return portal_diagrams_subdir(canonical_portal_folder_name(project_name_from_log))

    keys = extract_project_match_keys(project_name_from_log)
    if not keys:
        return portal_diagrams_subdir(canonical_portal_folder_name(project_name_from_log))

    for key in keys:
        matched = [d for d in existing_dirs if dir_matches_project_key(d, key)]
        if matched:
            chosen = pick_canonical_dir(matched)
            if len(matched) > 1 and key not in _warned_ambiguous_folder_keys:
                _warned_ambiguous_folder_keys.add(key)
                log(
                    f"Несколько папок для ключа «{key}»: выбрана «{chosen}» ({len(matched)} совпад.)",
                    level=logging.WARNING,
                )
            return chosen

    primary = keys[0]
    safe = re.sub(r"[^\w\-]", "_", primary).strip("_")
    if safe:
        return safe
    return portal_diagrams_subdir(canonical_portal_folder_name(project_name_from_log))


def sharepoint_folder_from_resolved(resolved_subdir):
    """Имя папки проекта на SharePoint из имени каталога портала (подчёркивания → пробелы)."""
    if not resolved_subdir:
        return resolved_subdir
    return resolved_subdir.replace("_", " ")


def get_latest_dated_folder(diagrams_root, label=""):
    """Самая поздняя подпапка ДД_ММ_ГГГГ; иначе корень, если в нём есть файлы."""
    tag = f" ({label})" if label else ""
    if not os.path.exists(diagrams_root):
        log(f"[ERR] Корень диаграмм не найден{tag}: {diagrams_root}", level=logging.ERROR)
        return None

    folders = []
    date_pattern = re.compile(r"^(\d{2})_(\d{2})_(\d{4})$")
    try:
        for item in os.listdir(diagrams_root):
            item_path = os.path.join(diagrams_root, item)
            if os.path.isdir(item_path):
                m = date_pattern.match(item)
                if m:
                    day, month, year = m.groups()
                    try:
                        folder_date = datetime(int(year), int(month), int(day))
                        folders.append((folder_date, item_path))
                    except ValueError:
                        continue
    except Exception as e:
        log(f"[ERR] Чтение {diagrams_root}{tag}: {e}", level=logging.ERROR)
        return None

    if not folders:
        try:
            for fn in os.listdir(diagrams_root):
                fp = os.path.join(diagrams_root, fn)
                if os.path.isfile(fp):
                    log(f"Нет папок ДД_ММ_ГГГГ — берём корень{tag}: {diagrams_root}", level=logging.INFO)
                    return diagrams_root
        except Exception as e:
            log(f"[WARN] Проверка корня{tag}: {e}", level=logging.WARNING)
        log(f"[WARN] В {diagrams_root} нет датированных папок и файлов в корне{tag}", level=logging.WARNING)
        return None

    folders.sort(key=lambda x: x[0], reverse=True)
    log(
        f"Самая свежая папка{tag}: {folders[0][1]} ({folders[0][0].strftime('%d.%m.%Y')})",
        level=logging.INFO,
    )
    return folders[0][1]

# -------------------------------------------------------------------------
# Логирование (с fallback на локальную папку если сетевой путь недоступен)
# -------------------------------------------------------------------------
os.makedirs(LOCAL_LOG_DIR, exist_ok=True)
log_handlers = [
    logging.FileHandler(LOCAL_FULL_LOG, encoding='utf-8'),
    logging.FileHandler(LOCAL_DEBUG_LOG, encoding='utf-8'),
    logging.StreamHandler(sys.stdout)
]
try:
    if os.path.exists(os.path.dirname(FULL_LOG_NAME)):
        log_handlers.insert(0, logging.FileHandler(FULL_LOG_NAME, encoding='utf-8'))
        log_handlers.insert(1, logging.FileHandler(DEBUG_LOG_NAME, encoding='utf-8'))
except Exception:
    pass

logging.basicConfig(
    level=logging.DEBUG,
    format='%(asctime)s - %(levelname)s - %(message)s',
    handlers=log_handlers
)


def log(message, level=logging.INFO):
    if level == logging.INFO:
        logging.info(f"{datetime.now().strftime('%H:%M:%S %d/%m/%Y')} - {message}")
    elif level == logging.DEBUG:
        logging.debug(f"{datetime.now().strftime('%H:%M:%S %d/%m/%Y')} - {message}")
    elif level == logging.ERROR:
        logging.error(f"{datetime.now().strftime('%H:%M:%S %d/%m/%Y')} - {message}")
    elif level == logging.WARNING:
        logging.warning(f"{datetime.now().strftime('%H:%M:%S %d/%m/%Y')} - {message}")


def send_telegram_message(text):
    if not TELEGRAM_BOT_TOKEN or not TELEGRAM_CHAT_ID:
        return
    try:
        url = f"https://api.telegram.org/bot{TELEGRAM_BOT_TOKEN}/sendMessage"
        payload = {
            "chat_id": TELEGRAM_CHAT_ID,
            "text": text,
            "parse_mode": "HTML",
            "disable_web_page_preview": True
        }
        requests.post(url, json=payload, timeout=10)
    except Exception as e:
        log(f"Ошибка отправки в Telegram: {e}", level=logging.ERROR)


def test_sharepoint_access():
    try:
        test_url = f"{SHAREPOINT_SITE}/_vti_bin/copy.asmx"
        session = requests.Session()
        session.auth = HttpNtlmAuth(USERNAME, PASSWORD)
        soap_test = """<?xml version="1.0" encoding="utf-8"?>
        <soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
          <soap:Body>
            <GetItem xmlns="http://schemas.microsoft.com/sharepoint/soap/">
              <Url>http://tepmsp11</Url>
            </GetItem>
          </soap:Body>
        </soap:Envelope>"""
        headers = {'Content-Type': 'text/xml; charset=utf-8'}
        response = session.post(test_url, data=soap_test, headers=headers, timeout=30)
        if response.status_code == 200:
            log("[OK] SharePoint: Успешно", level=logging.INFO)
            return True
        log(f"[ERR] SharePoint: HTTP {response.status_code}", level=logging.ERROR)
        return False
    except Exception as e:
        log(f"[ERR] SharePoint: {e}", level=logging.ERROR)
        return False


def validate_log_files():
    log("Проверка лог-файлов...", level=logging.INFO)
    validated_entries = []
    problematic_entries = []
    for log_file in [DIAGRAMS_LIST, ENUMS_LIST]:
        if not os.path.exists(log_file):
            log(f"[WARN] Не найден: {log_file}", level=logging.WARNING)
            continue
        try:
            with open(log_file, 'r', encoding='utf-8', errors='replace') as f:
                lines = f.readlines()
            for i, line in enumerate(lines, 1):
                line = line.strip()
                if not line:
                    continue
                parts = line.split(';')
                if len(parts) < 5:
                    problematic_entries.append(f"Строка {i}: неверный формат")
                    continue
                project = parts[0].strip()
                if special_project_key(project) is not None:
                    validated_entries.append(line)
                    continue
                folder = parts[3].strip()
                filename = parts[4].strip()
                full_path = os.path.join(folder, filename)
                if not os.path.exists(folder):
                    problematic_entries.append(f"Строка {i}: папка не существует")
                    continue
                if not os.path.exists(full_path):
                    problematic_entries.append(f"Строка {i}: файл не найден")
                    continue
                validated_entries.append(line)
        except Exception as e:
            log(f"[ERR] Чтение {log_file}: {e}", level=logging.ERROR)
    log(f"[OK] Валидных записей: {len(validated_entries)}", level=logging.INFO)
    return validated_entries


def read_text_file_encodings(path):
    """Строки файла (utf-8 или cp1251)."""
    for enc in ("utf-8", "cp1251"):
        try:
            with open(path, "r", encoding=enc) as f:
                return f.readlines(), enc
        except UnicodeDecodeError:
            continue
    with open(path, "r", encoding="utf-8", errors="replace") as f:
        return f.readlines(), "utf-8 (replace)"


def iter_diagram_log_file_paths():
    """
    Основной DIAGRAMSLIST.log и все архивные DIAGRAMSLIST_DD.MM.YY.log (кроме DEBUG).
    Новые выгрузки часто попадают только в датированный файл — его нужно учитывать при sync.
    """
    base_dir = os.path.dirname(DIAGRAMS_LIST)
    out = []
    if os.path.isfile(DIAGRAMS_LIST):
        out.append(DIAGRAMS_LIST)
    dated = []
    for path in glob.glob(os.path.join(base_dir, "DIAGRAMSLIST_*.log")):
        bn = os.path.basename(path)
        if "DEBUG" in bn.upper():
            continue
        m = re.match(r"^DIAGRAMSLIST_(\d{2})\.(\d{2})\.(\d{2,4})\.log$", bn, re.I)
        if not m:
            continue
        d, mo, y = m.groups()
        yi = int(y) if len(y) == 4 else 2000 + int(y)
        dated.append(((yi, int(mo), int(d)), path))
    dated.sort(key=lambda x: x[0])
    out.extend(p for _, p in dated)
    return out


def _clean_project_field(raw):
    """Убирает префикс «Ошибка при обработке …» из поля проекта в некоторых логах."""
    s = raw.strip()
    low = s.lower()
    if "обработке" in low:
        parts = s.split("обработке", 1)
        if len(parts) > 1:
            s = parts[-1].strip()
    return s


def parse_diagram_list_line(line):
    """
    Разбор строки project;…;title;…;file.pdf.
    Поле проекта может содержать мусор перед именем (строки об ошибке из скрипта выгрузки).
    """
    line = line.strip()
    if not line:
        return None
    parts = line.split(";")
    if len(parts) < 5:
        return None
    pdf_idx = None
    for i, seg in enumerate(parts):
        if seg.strip().lower().endswith(".pdf"):
            pdf_idx = i
            break
    if pdf_idx is None or pdf_idx < 4:
        return None
    project = _clean_project_field(parts[pdf_idx - 4])
    title = parts[pdf_idx - 2].strip()
    filename = parts[pdf_idx].strip()
    if not project or not filename:
        return None
    return project, title, filename


def sync_diagram_titles_from_log():
    """
    Заполняет/обновляет diagram_titles.json по полю «Название» из лога для файлов,
    которые уже есть в data/diagrams (если PDF скопировали вручную — названий не будет без этого шага).
    """
    paths = iter_diagram_log_file_paths()
    if not paths:
        log(f"[ERR] Нет файлов лога рядом с {DIAGRAMS_LIST}", level=logging.ERROR)
        return 0
    log(f"Файлов лога для разбора: {len(paths)} (в т.ч. архивные DIAGRAMSLIST_DD.MM.YY.log)", level=logging.INFO)
    updated = 0
    missing_file = 0
    parsed_ok = 0
    existing = list_existing_portal_diagram_dirs()
    for log_path in paths:
        lines, _enc = read_text_file_encodings(log_path)
        for line in lines:
            parsed = parse_diagram_list_line(line)
            if not parsed:
                continue
            parsed_ok += 1
            project, title, filename = parsed
            sub = resolve_portal_diagram_folder(project, existing)
            dest_dir = os.path.join(NEW_PORTAL_DIAGRAMS_PATH, sub)
            dest_file = os.path.join(dest_dir, filename)
            if not os.path.isfile(dest_file):
                missing_file += 1
                continue
            _merge_diagram_title(dest_dir, filename, title)
            updated += 1
    log(
        f"[OK] diagram_titles.json: обновлений {updated}; "
        f"строк с разбором имени файла: {parsed_ok}; "
        f"нет файла в портале под разобранным именем: {missing_file}",
        level=logging.INFO,
    )
    return updated


def build_copy_soap(source_url, destination_urls, fields, base64_stream):
    soap_body = f"""<?xml version="1.0" encoding="utf-8"?>
    <soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"
                   xmlns:tns="http://schemas.microsoft.com/sharepoint/soap/">
      <soap:Body>
        <CopyIntoItems xmlns="http://schemas.microsoft.com/sharepoint/soap/">
          <SourceUrl>{source_url}</SourceUrl>
          <DestinationUrls>
            {''.join(f"<string>{url}</string>" for url in destination_urls)}
          </DestinationUrls>
          <Fields>
            {''.join(f'''
            <FieldInformation Type="{f['Type']}" DisplayName="{f['DisplayName']}"
                             InternalName="{f.get('InternalName', f['DisplayName'])}"
                             Value="{f['Value']}" />''' for f in fields)}
          </Fields>
          <Stream>{base64_stream}</Stream>
        </CopyIntoItems>
      </soap:Body>
    </soap:Envelope>"""
    return soap_body.strip()


def _merge_diagram_title(dest_dir, filename, title):
    """Обновляет diagram_titles.json: отображаемое имя на портале (поле «Название» из лога)."""
    meta_path = os.path.join(dest_dir, "diagram_titles.json")
    titles = {}
    if os.path.isfile(meta_path):
        try:
            with open(meta_path, "r", encoding="utf-8") as f:
                titles = json.load(f)
            if not isinstance(titles, dict):
                titles = {}
        except (OSError, json.JSONDecodeError):
            titles = {}
    titles[filename] = title.strip() if title else filename
    with open(meta_path, "w", encoding="utf-8") as f:
        json.dump(titles, f, ensure_ascii=False, indent=2)


def _merge_diagram_pdms_at(dest_dir, filename, iso_ts):
    """Дата/время добавления файла на портал из выгрузки PDMS (RFC3339)."""
    meta_path = os.path.join(dest_dir, DIAGRAM_PDMS_AT_FILENAME)
    data = {}
    if os.path.isfile(meta_path):
        try:
            with open(meta_path, "r", encoding="utf-8") as f:
                data = json.load(f)
            if not isinstance(data, dict):
                data = {}
        except (OSError, json.JSONDecodeError):
            data = {}
    data[filename] = iso_ts
    with open(meta_path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)


def copy_to_new_portal(source_path, project, filename, title, existing_dirs, import_ts_iso=None):
    """
    Копирует файл в data/diagrams/<resolved>/; папка выбирается по номеру проекта (см. resolve_portal_diagram_folder).
    Возвращает (успех, имя подпапки).
    """
    if import_ts_iso is None:
        import_ts_iso = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    try:
        resolved = resolve_portal_diagram_folder(project, existing_dirs)
        dest_dir = os.path.join(NEW_PORTAL_DIAGRAMS_PATH, resolved)
        os.makedirs(dest_dir, exist_ok=True)
        dest_path = os.path.join(dest_dir, filename)
        shutil.copy2(source_path, dest_path)
        _merge_diagram_title(dest_dir, filename, title)
        _merge_diagram_pdms_at(dest_dir, filename, import_ts_iso)
        if resolved not in existing_dirs:
            existing_dirs.append(resolved)
        log(f"[OK] В портал: {dest_path} (каталог «{resolved}»)", level=logging.DEBUG)
        return True, resolved
    except Exception as e:
        log(f"[WARN] Не скопировать в портал: {e}", level=logging.WARNING)
        return False, ""


def publish_file(input_line, file_index, total_files, special_latest=None, local_only=False, existing_dirs=None):
    """
    Копирует файл в data/diagrams. Если local_only=False, также загружает в SharePoint.
    Для проектов из SPECIAL_DIAGRAM_ROOTS источник — последняя датированная папка (special_latest).
    existing_dirs — кэш имён подпапок data/diagrams (обновляется при появлении новых).
    """
    if existing_dirs is None:
        existing_dirs = list_existing_portal_diagram_dirs()
    try:
        parts = input_line.strip().split(';')
        if len(parts) < 5:
            return False, "Неверный формат"
        project = parts[0].strip()
        department = parts[1].strip()
        title = parts[2].strip()
        folder_path = parts[3].strip()
        filename = parts[4].strip()

        sk = special_project_key(project)
        if sk is not None:
            if not special_latest:
                return False, "Не передан special_latest"
            source_dir = special_latest.get(sk)
            if source_dir is None:
                return False, f"Нет каталога диаграмм для «{sk}»"
        else:
            source_dir = folder_path
        source_path = os.path.join(source_dir, filename)

        if not os.path.exists(source_path):
            log(f"[ERR] Файл не найден: {source_path}", level=logging.ERROR)
            return False, "Файл не найден"

        # Всегда копируем в папку портала (data/diagrams)
        ok, resolved = copy_to_new_portal(source_path, project, filename, title, existing_dirs)
        if ok:
            if local_only:
                return True, "Скопировано в портал"

            # Загрузка в SharePoint (если не local_only и сеть доступна)
            try:
                sp_folder = sharepoint_folder_from_resolved(resolved)
                base = PROJECTS_BASE_URL.rstrip("/")
                dest_url = f"{base}/{'/'.join([quote(sp_folder, safe=''), quote(PID_DIR_NAME, safe=''), quote(filename, safe='')])}"
                dest_path = os.path.join(PROJECTS_BASE_PATH, sp_folder, PID_DIR_NAME)
                os.makedirs(dest_path, exist_ok=True)

                spec = parts[5].strip() if len(parts) > 5 and parts[5].strip() else "unset"
                field_info = [
                    {"DisplayName": "Отдел", "InternalName": "Department", "Type": "Text", "Value": department},
                    {"DisplayName": "Название", "InternalName": "Title", "Type": "Text", "Value": title},
                    {"DisplayName": "Специализация", "InternalName": "Specialization", "Type": "Choice", "Value": spec},
                ]
                with open(source_path, 'rb') as f:
                    file_data = f.read()
                base64_content = base64.b64encode(file_data).decode('utf-8')

                soap_url = f"{SHAREPOINT_SITE}/_vti_bin/copy.asmx"
                headers = {
                    'Content-Type': 'text/xml; charset=utf-8',
                    'SOAPAction': 'http://schemas.microsoft.com/sharepoint/soap/CopyIntoItems'
                }
                session = requests.Session()
                session.auth = HttpNtlmAuth(USERNAME, PASSWORD)
                soap_body = build_copy_soap(source_path, [dest_url], field_info, base64_content)
                response = session.post(soap_url, data=soap_body, headers=headers, timeout=60)

                if response.status_code == 200 and "<CopyIntoItemsResult>0</CopyIntoItemsResult>" in response.text:
                    return True, "Успешно"
            except Exception as e:
                log(f"[WARN] SharePoint недоступен, файл скопирован только локально: {e}", level=logging.WARNING)

            return True, "Скопировано в портал (SharePoint недоступен)"
        return False, "Не удалось скопировать в портал"
    except Exception as e:
        return False, str(e)


def delete_files():
    try:
        if not os.path.exists(PROJECTS_BASE_PATH):
            return
        if os.path.isfile(PROJECTS_BASE_PATH):
            os.remove(PROJECTS_BASE_PATH)
        else:
            for root, dirs, files in os.walk(PROJECTS_BASE_PATH, topdown=False):
                for name in files:
                    try:
                        os.remove(os.path.join(root, name))
                    except Exception:
                        pass
                for name in dirs:
                    try:
                        shutil.rmtree(os.path.join(root, name), ignore_errors=True)
                    except Exception:
                        pass
        log("[OK] Очистка SharePoint завершена", level=logging.INFO)
    except Exception as e:
        log(f"[ERR] Очистка: {e}", level=logging.ERROR)


def check_network_connectivity():
    for server in ["tepmsp11", "tep-m.ru"]:
        try:
            result = subprocess.run(["ping", "-n", "1", server], capture_output=True, text=True, timeout=5)
            if result.returncode == 0:
                log(f"[OK] {server} доступен", level=logging.INFO)
            else:
                log(f"[WARN] {server} недоступен", level=logging.WARNING)
        except Exception as e:
            log(f"[WARN] ping {server}: {e}", level=logging.WARNING)


# =========================================================================
# MAIN
# =========================================================================
if __name__ == "__main__":
    args = sys.argv[1:]
    if "--sync-titles" in args:
        log("Режим --sync-titles: обновление diagram_titles.json из лога (без копирования и SharePoint)", level=logging.INFO)
        log(f"Папка портала: {NEW_PORTAL_DIAGRAMS_PATH}", level=logging.INFO)
        if not os.path.exists(DIAGRAMS_LIST):
            log(f"[ERR] Недоступен лог: {DIAGRAMS_LIST}", level=logging.ERROR)
            sys.exit(1)
        n = sync_diagram_titles_from_log()
        sys.exit(0 if n >= 0 else 1)

    local_only = "--local" in args or "-l" in args
    no_delete = "nd" in args

    log("Запуск скрипта переноса PID-схем (TepPortal)", level=logging.INFO)
    log(f"Дата: {datetime.now().strftime('%d.%m.%Y %H:%M:%S')}", level=logging.INFO)
    log(f"Папка портала: {NEW_PORTAL_DIAGRAMS_PATH}", level=logging.INFO)
    if local_only:
        log("Режим: --local (только копирование в data/diagrams, без SharePoint)", level=logging.INFO)

    check_network_connectivity()

    if not local_only:
        if not test_sharepoint_access():
            err = "[ERR] Нет доступа к SharePoint. Используйте --local для копирования только в портал."
            log(err, level=logging.ERROR)
            send_telegram_message(err)
            sys.exit(1)
    else:
        log("[OK] SharePoint пропущен (--local)", level=logging.INFO)

    special_latest = {}
    for proj_key, root in SPECIAL_DIAGRAM_ROOTS.items():
        resolved = resolve_diagram_root(proj_key, root)
        if resolved is None:
            special_latest[proj_key] = None
            log(
                f"[WARN] Не удалось определить корень диаграмм для «{proj_key}» — такие строки будут пропускаться.",
                level=logging.WARNING,
            )
            continue
        special_latest[proj_key] = get_latest_dated_folder(resolved, label=proj_key)
        if special_latest[proj_key] is None:
            log(f"[WARN] Нет датированной папки для «{proj_key}»", level=logging.WARNING)

    if not local_only and not no_delete:
        delete_files()
    elif no_delete:
        log("Очистка пропущена (nd)", level=logging.WARNING)

    if not os.path.exists(DIAGRAMS_LIST) and not os.path.exists(ENUMS_LIST):
        err = "[ERR] Лог-файлы не найдены"
        log(err, level=logging.ERROR)
        send_telegram_message(f"🔴 {err}")
        sys.exit(1)

    entries = validate_log_files()
    if not entries:
        err = "[ERR] Нет валидных записей"
        log(err, level=logging.ERROR)
        send_telegram_message(f"🔴 {err}")
        sys.exit(1)

    log(f"Записей для обработки: {len(entries)}", level=logging.INFO)

    uploaded = 0
    failed = 0
    failed_details = []
    existing_portal_dirs = list_existing_portal_diagram_dirs()

    for i, line in enumerate(entries, 1):
        result, message = publish_file(
            line,
            i,
            len(entries),
            special_latest=special_latest,
            local_only=local_only,
            existing_dirs=existing_portal_dirs,
        )
        if result:
            uploaded += 1
        else:
            failed += 1
            failed_details.append(f"{i}. {line[:50]}... - {message}")
        time.sleep(0.5)

    status = "[OK] Успешно" if failed == 0 else "[WARN] Частично" if uploaded > 0 else "[ERR] Провалено"
    log("=" * 60, level=logging.INFO)
    log(f"{status} | Загружено: {uploaded} | Ошибок: {failed}", level=logging.INFO)
    log("=" * 60, level=logging.INFO)

    summary = [f"Загружено: {uploaded}", f"Ошибок: {failed}"]
    msg = f"<b>{status}</b> | PID-схемы | {datetime.now():%d.%m.%Y %H:%M}\n" + "\n".join(f"- {s}" for s in summary)
    if failed_details:
        msg += f"\n\nОшибки ({min(3, len(failed_details))}):\n" + "\n".join(failed_details[:3])
    send_telegram_message(msg)

    sys.exit(0 if failed == 0 else 1 if uploaded > 0 else 1)
