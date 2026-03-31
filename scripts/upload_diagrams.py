#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Скрипт переноса PID-схем в SharePoint и в папку нового портала TepPortal.
Запуск: python upload_diagrams.py [--local] [nd]
  --local, -l  — только копирование в data/diagrams (без SharePoint, для localhost)
  nd           — не удалять файлы перед загрузкой (no delete)
"""

import os
import re
import sys
import shutil
import logging
import base64
import requests
import time
import subprocess
from requests_ntlm import HttpNtlmAuth
from datetime import datetime

# Импорт конфига (создайте config.py из config.example.py)
try:
    from config import USERNAME, PASSWORD, TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID
except ImportError:
    USERNAME = os.environ.get("DIAGRAMS_USERNAME", r"tep-m.ru\BatyanovskiyGV")
    PASSWORD = os.environ.get("DIAGRAMS_PASSWORD", "VLrx5siGo4")
    TELEGRAM_BOT_TOKEN = os.environ.get("TELEGRAM_BOT_TOKEN", "")
    TELEGRAM_CHAT_ID = os.environ.get("TELEGRAM_CHAT_ID", "")

# -------------------------------------------------------------------------
# Константы
# -------------------------------------------------------------------------
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.dirname(SCRIPT_DIR)

DIAGRAMS_LIST = r"\\tep-m.ru\data\App\PDMS\PDMS_TEP\LOG\DIAGRAMSLIST.log"
ENUMS_LIST = r"\\tep-m.ru\data\App\PDMS\PDMS_TEP\LOG\ENUMSLIST.log"

SHAREPOINT_SITE = "http://tepmsp11"
PROJECTS_BASE_URL = "http://tepmsp11/Projects"
PROJECTS_BASE_PATH = r"\\tepmsp11\Projects"

# Папка для нового портала TepPortal (data/diagrams)
NEW_PORTAL_DIAGRAMS_PATH = os.path.join(PROJECT_ROOT, "data", "diagrams")

PID_DIR_NAME = "PID схемы"

FULL_LOG_NAME = rf"\\tep-m.ru\data\App\PDMS\PDMS_TEP\LOG\DIAGRAMSLIST_{datetime.now():%d.%m.%y}.log"
DEBUG_LOG_NAME = rf"\\tep-m.ru\data\App\PDMS\PDMS_TEP\LOG\DIAGRAMSLIST_DEBUG_{datetime.now():%d.%m.%y}.log"
LOCAL_LOG_DIR = os.path.join(SCRIPT_DIR, "logs")
LOCAL_FULL_LOG = os.path.join(LOCAL_LOG_DIR, f"diagrams_{datetime.now():%Y%m%d}.log")
LOCAL_DEBUG_LOG = os.path.join(LOCAL_LOG_DIR, f"diagrams_debug_{datetime.now():%Y%m%d}.log")

# UYK 261N1
UYK_DIAGRAMS_ROOT = r"\\tep-m.ru\data\App\PDMS\PDMS_TEP\PROJECTS\E3D\UYK\uykdia"
UYK_PROJECT_IDENTIFIER = "UYK 261N1"

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


def get_latest_uyk_folder():
    if not os.path.exists(UYK_DIAGRAMS_ROOT):
        log(f"[ERR] UYK не найдена: {UYK_DIAGRAMS_ROOT}", level=logging.ERROR)
        return None
    folders = []
    date_pattern = re.compile(r"^(\d{2})_(\d{2})_(\d{4})$")
    try:
        for item in os.listdir(UYK_DIAGRAMS_ROOT):
            item_path = os.path.join(UYK_DIAGRAMS_ROOT, item)
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
        log(f"[ERR] UYK: {e}", level=logging.ERROR)
        return None
    if not folders:
        return None
    folders.sort(key=lambda x: x[0], reverse=True)
    return folders[0][1]


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
                if UYK_PROJECT_IDENTIFIER in project:
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


def copy_to_new_portal(source_path, project, filename):
    """Копирует файл в папку нового портала data/diagrams/{project}/"""
    try:
        safe_project = re.sub(r'[^\w\-]', '_', project)
        dest_dir = os.path.join(NEW_PORTAL_DIAGRAMS_PATH, safe_project)
        os.makedirs(dest_dir, exist_ok=True)
        dest_path = os.path.join(dest_dir, filename)
        shutil.copy2(source_path, dest_path)
        log(f"[OK] В портал: {dest_path}", level=logging.DEBUG)
        return True
    except Exception as e:
        log(f"[WARN] Не скопировать в портал: {e}", level=logging.WARNING)
        return False


def publish_file(input_line, file_index, total_files, uyk_folder=None, local_only=False):
    """
    Копирует файл в data/diagrams. Если local_only=False, также загружает в SharePoint.
    """
    try:
        parts = input_line.strip().split(';')
        if len(parts) < 5:
            return False, "Неверный формат"
        project = parts[0].strip()
        department = parts[1].strip()
        title = parts[2].strip()
        folder_path = parts[3].strip()
        filename = parts[4].strip()

        is_uyk = UYK_PROJECT_IDENTIFIER in project
        source_dir = uyk_folder if is_uyk and uyk_folder else folder_path
        source_path = os.path.join(source_dir, filename)

        if not os.path.exists(source_path):
            log(f"[ERR] Файл не найден: {source_path}", level=logging.ERROR)
            return False, "Файл не найден"

        # Всегда копируем в папку портала (data/diagrams)
        if copy_to_new_portal(source_path, project, filename):
            if local_only:
                return True, "Скопировано в портал"

            # Загрузка в SharePoint (если не local_only и сеть доступна)
            try:
                dest_url = f"{PROJECTS_BASE_URL}/{project}/{PID_DIR_NAME}/{filename}"
                dest_path = os.path.join(PROJECTS_BASE_PATH, project, PID_DIR_NAME)
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

    latest_uyk_folder = get_latest_uyk_folder()

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

    for i, line in enumerate(entries, 1):
        result, message = publish_file(line, i, len(entries), uyk_folder=latest_uyk_folder, local_only=local_only)
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
