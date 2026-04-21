// Утилита: назначить пользователю роль administrator в PostgreSQL (таблица user_roles).
// Запуск из каталога backend: go run ./cmd/grant-admin
package main

import (
	"database/sql"
	"log"
	"os"
	"path/filepath"
	"strings"

	_ "github.com/jackc/pgx/v5/stdlib"
	"github.com/joho/godotenv"
)

func main() {
	// .env рядом с backend (рабочая директория = backend при go run ./cmd/grant-admin)
	_ = godotenv.Load()
	if _, err := os.Stat(".env"); os.IsNotExist(err) {
		_ = godotenv.Load(filepath.Join("..", ".env"))
	}
	dsn := strings.TrimSpace(os.Getenv("DATABASE_URL"))
	if dsn == "" {
		dsn = strings.TrimSpace(os.Getenv("POSTGRES_DSN"))
	}
	if dsn == "" {
		log.Fatal("Задайте DATABASE_URL или POSTGRES_DSN в backend/.env")
	}

	db, err := sql.Open("pgx", dsn)
	if err != nil {
		log.Fatal(err)
	}
	defer db.Close()
	if err := db.Ping(); err != nil {
		log.Fatalf("PostgreSQL: %v", err)
	}

	user := strings.TrimSpace(os.Getenv("GRANT_ADMIN_USER"))
	if user == "" && len(os.Args) >= 2 {
		user = strings.TrimSpace(os.Args[1])
	}
	if user == "" {
		log.Fatal("Укажите пользователя: переменная GRANT_ADMIN_USER или аргумент: go run ./cmd/grant-admin <samAccountName>")
	}
	const role = "administrator"
	_, err = db.Exec(`
INSERT INTO user_roles (username, role, updated_at)
VALUES ($1, $2, now())
ON CONFLICT (username) DO UPDATE SET role = EXCLUDED.role, updated_at = now()
`, user, role)
	if err != nil {
		log.Fatal(err)
	}
	log.Printf("OK: %s -> %s\n", user, role)
}
