package handlers

import (
	"database/sql"
	"fmt"
	"log"
	"os"
	"strings"

	_ "github.com/jackc/pgx/v5/stdlib"
)

type pgRoleStore struct {
	db *sql.DB
}

func newPgRoleStore(dsn string) (*pgRoleStore, error) {
	db, err := sql.Open("pgx", dsn)
	if err != nil {
		return nil, err
	}
	db.SetMaxOpenConns(8)
	db.SetMaxIdleConns(4)
	if err := db.Ping(); err != nil {
		_ = db.Close()
		return nil, fmt.Errorf("postgres ping: %w", err)
	}
	if _, err := db.Exec(`
CREATE TABLE IF NOT EXISTS user_roles (
	username TEXT PRIMARY KEY,
	role TEXT NOT NULL,
	updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
)`); err != nil {
		_ = db.Close()
		return nil, fmt.Errorf("postgres migrate user_roles: %w", err)
	}
	if err := migratePortalAnalyticsTables(db); err != nil {
		_ = db.Close()
		return nil, err
	}
	st := &pgRoleStore{db: db}
	if err := st.maybeImportFromJSON(); err != nil {
		_ = db.Close()
		return nil, err
	}
	if err := syncPortalAnalyticsFromJSON(db); err != nil {
		log.Printf("PostgreSQL: предупреждение — не удалась синхронизация analytics-таблиц: %v\n", err)
	}
	if err := seedTechnicalGlossaryIfNeeded(db); err != nil {
		log.Printf("PostgreSQL: предупреждение — не удалось заполнить ref_technical_glossary: %v\n", err)
	}
	return st, nil
}

// maybeImportFromJSON переносит data/user_roles.json в пустую таблицу (один раз при миграции).
func (s *pgRoleStore) maybeImportFromJSON() error {
	var n int
	if err := s.db.QueryRow(`SELECT COUNT(*) FROM user_roles`).Scan(&n); err != nil {
		return err
	}
	if n > 0 {
		return nil
	}
	if strings.TrimSpace(os.Getenv("SKIP_JSON_ROLES_IMPORT")) == "1" {
		return nil
	}
	m, err := loadRolesFromJSONFile()
	if err != nil || len(m) == 0 {
		return nil
	}
	tx, err := s.db.Begin()
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback() }()
	inserted := 0
	for u, r := range m {
		r = normalizeRole(r)
		if _, err := tx.Exec(`INSERT INTO user_roles (username, role) VALUES ($1, $2)`, u, r); err != nil {
			return err
		}
		inserted++
	}
	if err := tx.Commit(); err != nil {
		return err
	}
	if inserted > 0 {
		log.Printf("Роли: импортировано %d записей из JSON в PostgreSQL\n", inserted)
	}
	return nil
}

func (s *pgRoleStore) All() (map[string]string, error) {
	rows, err := s.db.Query(`SELECT username, role FROM user_roles`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := map[string]string{}
	for rows.Next() {
		var u, r string
		if err := rows.Scan(&u, &r); err != nil {
			return nil, err
		}
		out[normalizeUsername(u)] = normalizeRole(r)
	}
	return out, rows.Err()
}

func (s *pgRoleStore) Get(un string) (string, bool, error) {
	var r string
	err := s.db.QueryRow(`SELECT role FROM user_roles WHERE username = $1`, un).Scan(&r)
	if err == sql.ErrNoRows {
		return "", false, nil
	}
	if err != nil {
		return "", false, err
	}
	return r, true, nil
}

func (s *pgRoleStore) Set(un, role string) error {
	r := normalizeRole(role)
	_, err := s.db.Exec(`
INSERT INTO user_roles (username, role, updated_at)
VALUES ($1, $2, now())
ON CONFLICT (username) DO UPDATE SET role = EXCLUDED.role, updated_at = now()
`, un, r)
	return err
}
