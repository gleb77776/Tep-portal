# Скрипт загрузки PID-схем

Скрипт переносит диаграммы из PDMS в SharePoint и в папку нового портала (`data/diagrams`).

## Установка

```bash
pip install -r scripts/requirements.txt
```

Создайте `config.py` из `config.example.py` и укажите учётные данные.

## Запуск

```bash
# Из корня проекта
python scripts/upload_diagrams.py

# Без предварительной очистки (nd = no delete)
python scripts/upload_diagrams.py nd
```

Или двойной клик по `run_upload.bat`.

## Планировщик заданий (8:00 каждый день)

1. Откройте «Планировщик заданий» (taskschd.msc)
2. Создать задачу → Импорт → выберите `schedule_daily.xml`
3. **Измените** в действии:
   - Путь к python (где установлен)
   - Путь к проекту в `WorkingDirectory`
   - Укажите учётную запись с доступом к сети tep-m.ru
4. Сохраните и введите пароль учётной записи

Либо создайте задачу вручную:
- Программа: `python` (или полный путь к python.exe)
- Аргументы: `"D:\Диплом\Project-TepPortal\scripts\upload_diagrams.py"`
- Рабочая папка: `D:\Диплом\Project-TepPortal`
- Триггер: ежедневно в 08:00
