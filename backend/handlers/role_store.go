package handlers

import (
	"encoding/json"
	"log"
	"os"
	"path/filepath"
	"strings"
)

// RoleStore — явные роли пользователей. Роль employee тоже храним: иначе после снятия админки запись удалялась,
// и getRoleForUsername снова попадал в bootstrap (AD_DEFAULT_USER / BatyanovskiyGV) — «сотрудник» оставался админом.
type RoleStore interface {
	All() (map[string]string, error)
	Get(normalizedUsername string) (role string, ok bool, err error)
	Set(normalizedUsername, role string) error
}

var roleStore RoleStore = &jsonRoleStore{}

// InitRoleStore подключает PostgreSQL при DATABASE_URL или POSTGRES_DSN, иначе остаётся JSON (data/user_roles.json).
func InitRoleStore() error {
	dsn := strings.TrimSpace(os.Getenv("DATABASE_URL"))
	if dsn == "" {
		dsn = strings.TrimSpace(os.Getenv("POSTGRES_DSN"))
	}
	if dsn != "" {
		pg, err := newPgRoleStore(dsn)
		if err != nil {
			return err
		}
		roleStore = pg
		log.Printf("Роли пользователей: PostgreSQL\n")
		return nil
	}
	roleStore = &jsonRoleStore{}
	log.Printf("Роли пользователей: JSON (%s)\n", getRolesPath())
	return nil
}

func loadRolesFromJSONFile() (map[string]string, error) {
	p := getRolesPath()
	data, err := os.ReadFile(p)
	if err != nil {
		if os.IsNotExist(err) {
			return map[string]string{}, nil
		}
		return nil, err
	}
	var raw map[string]string
	if err := json.Unmarshal(data, &raw); err != nil {
		return nil, err
	}
	out := map[string]string{}
	for k, v := range raw {
		out[normalizeUsername(k)] = normalizeRole(v)
	}
	return out, nil
}

type jsonRoleStore struct{}

func (jsonRoleStore) All() (map[string]string, error) {
	return loadRolesFromJSONFile()
}

func (jsonRoleStore) Get(un string) (string, bool, error) {
	m, err := loadRolesFromJSONFile()
	if err != nil {
		return "", false, err
	}
	r, ok := m[un]
	if !ok {
		return "", false, nil
	}
	return r, true, nil
}

func (jsonRoleStore) Set(un, role string) error {
	m, err := loadRolesFromJSONFile()
	if err != nil {
		return err
	}
	m[un] = normalizeRole(role)
	p := getRolesPath()
	if err := os.MkdirAll(filepath.Dir(p), 0755); err != nil {
		return err
	}
	data, err := json.MarshalIndent(m, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(p, data, 0644)
}
