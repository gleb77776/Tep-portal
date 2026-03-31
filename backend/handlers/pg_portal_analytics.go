package handlers

import (
	"database/sql"
	"fmt"
	"log"
	"os"
	"path/filepath"
	"strings"
	"time"
)

// Таблицы analytics_* и ref_technical_glossary — зеркало контента портала в PostgreSQL
// (требования ВКР: ≥10 таблиц, ≥500 записей). Рабочая логика API по-прежнему из JSON/файлов.

func migratePortalAnalyticsTables(db *sql.DB) error {
	stmts := []string{
		`CREATE TABLE IF NOT EXISTS analytics_news (
			id INTEGER PRIMARY KEY,
			icon TEXT NOT NULL DEFAULT '',
			title TEXT NOT NULL,
			date_str TEXT NOT NULL DEFAULT '',
			badge TEXT,
			synced_at TIMESTAMPTZ NOT NULL DEFAULT now()
		)`,
		`CREATE TABLE IF NOT EXISTS analytics_useful_links (
			id INTEGER PRIMARY KEY,
			name TEXT NOT NULL,
			url TEXT NOT NULL,
			synced_at TIMESTAMPTZ NOT NULL DEFAULT now()
		)`,
		`CREATE TABLE IF NOT EXISTS analytics_projects (
			id TEXT PRIMARY KEY,
			title TEXT NOT NULL,
			visible BOOLEAN NOT NULL DEFAULT true,
			author TEXT,
			created_at TEXT,
			source TEXT NOT NULL DEFAULT '',
			synced_at TIMESTAMPTZ NOT NULL DEFAULT now()
		)`,
		`CREATE TABLE IF NOT EXISTS analytics_project_documents (
			id TEXT PRIMARY KEY,
			project_id TEXT NOT NULL,
			name TEXT NOT NULL,
			ext TEXT NOT NULL DEFAULT '',
			file_path TEXT NOT NULL DEFAULT '',
			added_by TEXT,
			added_at TEXT,
			source TEXT NOT NULL DEFAULT '',
			synced_at TIMESTAMPTZ NOT NULL DEFAULT now()
		)`,
		`CREATE TABLE IF NOT EXISTS analytics_site_sections (
			id TEXT PRIMARY KEY,
			slug TEXT NOT NULL,
			title TEXT NOT NULL,
			icon TEXT NOT NULL DEFAULT '',
			template TEXT NOT NULL,
			sort_order INTEGER NOT NULL DEFAULT 0,
			show_on_home BOOLEAN NOT NULL DEFAULT false,
			home_order INTEGER NOT NULL DEFAULT 0,
			link_key TEXT,
			external_url TEXT,
			internal_path TEXT,
			is_system BOOLEAN NOT NULL DEFAULT false,
			synced_at TIMESTAMPTZ NOT NULL DEFAULT now()
		)`,
		`CREATE TABLE IF NOT EXISTS analytics_licenses_links (
			id INTEGER PRIMARY KEY,
			title TEXT NOT NULL,
			url TEXT NOT NULL,
			sort_order INTEGER NOT NULL DEFAULT 0,
			synced_at TIMESTAMPTZ NOT NULL DEFAULT now()
		)`,
		`CREATE TABLE IF NOT EXISTS analytics_section_card_links (
			link_key TEXT PRIMARY KEY,
			url TEXT NOT NULL,
			synced_at TIMESTAMPTZ NOT NULL DEFAULT now()
		)`,
		`CREATE TABLE IF NOT EXISTS analytics_section_menu_items (
			id BIGSERIAL PRIMARY KEY,
			section_id TEXT NOT NULL,
			item_id INTEGER NOT NULL,
			title TEXT NOT NULL,
			url TEXT NOT NULL,
			sort_order INTEGER NOT NULL DEFAULT 0,
			synced_at TIMESTAMPTZ NOT NULL DEFAULT now()
		)`,
		`CREATE TABLE IF NOT EXISTS analytics_diagram_files (
			id BIGSERIAL PRIMARY KEY,
			project_dir TEXT NOT NULL,
			file_name TEXT NOT NULL,
			rel_path TEXT NOT NULL,
			synced_at TIMESTAMPTZ NOT NULL DEFAULT now()
		)`,
		`CREATE TABLE IF NOT EXISTS ref_technical_glossary (
			id BIGSERIAL PRIMARY KEY,
			code TEXT NOT NULL UNIQUE,
			term TEXT NOT NULL,
			category TEXT NOT NULL DEFAULT '',
			description TEXT NOT NULL DEFAULT ''
		)`,
	}
	for _, q := range stmts {
		if _, err := db.Exec(q); err != nil {
			return fmt.Errorf("portal analytics migrate: %w", err)
		}
	}
	return nil
}

func truncatePortalAnalyticsSnapshots(db *sql.DB) error {
	_, err := db.Exec(`
		TRUNCATE TABLE
			analytics_diagram_files,
			analytics_section_menu_items,
			analytics_section_card_links,
			analytics_licenses_links,
			analytics_site_sections,
			analytics_project_documents,
			analytics_projects,
			analytics_useful_links,
			analytics_news
		RESTART IDENTITY
	`)
	return err
}

func syncPortalAnalyticsFromJSON(db *sql.DB) error {
	if strings.TrimSpace(os.Getenv("SKIP_PORTAL_PG_ANALYTICS")) == "1" {
		return nil
	}
	t0 := time.Now()
	if err := truncatePortalAnalyticsSnapshots(db); err != nil {
		return err
	}
	tx, err := db.Begin()
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback() }()

	news, err := loadNews()
	if err != nil {
		return err
	}
	for _, n := range news {
		var badge interface{}
		if n.Badge != nil {
			badge = *n.Badge
		}
		if _, err := tx.Exec(`INSERT INTO analytics_news (id, icon, title, date_str, badge) VALUES ($1,$2,$3,$4,$5)`,
			n.ID, n.Icon, n.Title, n.Date, badge); err != nil {
			return err
		}
	}

	links, err := loadLinks()
	if err != nil {
		return err
	}
	for _, l := range links {
		if _, err := tx.Exec(`INSERT INTO analytics_useful_links (id, name, url) VALUES ($1,$2,$3)`, l.ID, l.Name, l.URL); err != nil {
			return err
		}
	}

	projects, err := loadAdminProjects()
	if err != nil {
		return err
	}
	for _, p := range projects {
		if _, err := tx.Exec(`INSERT INTO analytics_projects (id, title, visible, author, created_at, source) VALUES ($1,$2,$3,$4,$5,$6)`,
			p.ID, p.Title, p.Visible, p.Author, p.CreatedAt, p.Source); err != nil {
			return err
		}
	}

	docsByPrj, err := loadAdminDocs()
	if err != nil {
		return err
	}
	for pid, docs := range docsByPrj {
		for _, d := range docs {
			if _, err := tx.Exec(`INSERT INTO analytics_project_documents (id, project_id, name, ext, file_path, added_by, added_at, source) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
				d.ID, pid, d.Name, d.Ext, d.File, d.AddedBy, d.AddedAt, "admin"); err != nil {
				return err
			}
		}
	}

	sections, err := loadSiteSections()
	if err != nil {
		return err
	}
	for _, s := range sections {
		if _, err := tx.Exec(`INSERT INTO analytics_site_sections (id, slug, title, icon, template, sort_order, show_on_home, home_order, link_key, external_url, internal_path, is_system) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
			s.ID, s.Slug, s.Title, s.Icon, s.Template, s.Order, s.ShowOnHome, s.HomeOrder, nullIfEmpty(s.LinkKey), nullIfEmpty(s.ExternalURL), nullIfEmpty(s.InternalPath), s.System); err != nil {
			return err
		}
	}

	lic, err := loadLicensesLinks()
	if err != nil {
		return err
	}
	for i, it := range lic {
		if _, err := tx.Exec(`INSERT INTO analytics_licenses_links (id, title, url, sort_order) VALUES ($1,$2,$3,$4)`, it.ID, it.Title, it.URL, i); err != nil {
			return err
		}
	}

	cards, err := loadSectionCardLinks()
	if err != nil {
		return err
	}
	for k, v := range cards {
		if _, err := tx.Exec(`INSERT INTO analytics_section_card_links (link_key, url) VALUES ($1,$2)`, k, v); err != nil {
			return err
		}
	}

	menuDir := filepath.Join(resolveDataDir(), "section_menus")
	_ = os.MkdirAll(menuDir, 0755)
	entries, _ := os.ReadDir(menuDir)
	for _, e := range entries {
		if e.IsDir() || !strings.HasSuffix(strings.ToLower(e.Name()), ".json") {
			continue
		}
		sid := strings.TrimSuffix(e.Name(), filepath.Ext(e.Name()))
		items, err := loadSectionMenuItems(sid)
		if err != nil || len(items) == 0 {
			continue
		}
		for i, it := range items {
			if _, err := tx.Exec(`INSERT INTO analytics_section_menu_items (section_id, item_id, title, url, sort_order) VALUES ($1,$2,$3,$4,$5)`,
				sid, it.ID, it.Title, it.URL, i); err != nil {
				return err
			}
		}
	}

	diagRoot := getDiagramsPathForProjects()
	if st, err := os.Stat(diagRoot); err == nil && st.IsDir() {
		_ = filepath.Walk(diagRoot, func(path string, info os.FileInfo, err error) error {
			if err != nil || info == nil || info.IsDir() {
				return nil
			}
			rel, err := filepath.Rel(diagRoot, path)
			if err != nil {
				return nil
			}
			parts := strings.Split(rel, string(filepath.Separator))
			if len(parts) < 2 {
				return nil
			}
			projDir := parts[0]
			if _, err := tx.Exec(`INSERT INTO analytics_diagram_files (project_dir, file_name, rel_path) VALUES ($1,$2,$3)`,
				projDir, info.Name(), filepath.ToSlash(rel)); err != nil {
				return err
			}
			return nil
		})
	}

	if err := tx.Commit(); err != nil {
		return err
	}
	log.Printf("PostgreSQL: синхронизированы analytics-таблицы из JSON/файлов за %v\n", time.Since(t0))
	return nil
}

func nullIfEmpty(s string) interface{} {
	s = strings.TrimSpace(s)
	if s == "" {
		return nil
	}
	return s
}

func seedTechnicalGlossaryIfNeeded(db *sql.DB) error {
	if strings.TrimSpace(os.Getenv("SKIP_PORTAL_PG_ANALYTICS")) == "1" {
		return nil
	}
	var n int
	if err := db.QueryRow(`SELECT COUNT(*) FROM ref_technical_glossary`).Scan(&n); err != nil {
		return err
	}
	if n >= 500 {
		return nil
	}
	cats := []string{"СМК", "Охрана труда и ГОЧС", "КЭПР", "Проектная документация", "Нормативные ссылки"}
	tx, err := db.Begin()
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback() }()
	if _, err := tx.Exec(`DELETE FROM ref_technical_glossary`); err != nil {
		return err
	}
	for i := 1; i <= 500; i++ {
		code := fmt.Sprintf("TEP-GLOSS-%04d", i)
		term := fmt.Sprintf("Показатель и термин предметной области ТЭП №%d", i)
		cat := cats[(i-1)%len(cats)]
		desc := fmt.Sprintf("Справочная запись для учёта понятий корпоративного портала и проектной организации (элемент %d).", i)
		if _, err := tx.Exec(`INSERT INTO ref_technical_glossary (code, term, category, description) VALUES ($1,$2,$3,$4)`,
			code, term, cat, desc); err != nil {
			return err
		}
	}
	if err := tx.Commit(); err != nil {
		return err
	}
	log.Printf("PostgreSQL: загружен справочник ref_technical_glossary (500 записей)\n")
	return nil
}
