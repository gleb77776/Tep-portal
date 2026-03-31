package handlers

import (
	"net/http"

	"github.com/gin-gonic/gin"
)

type Employee struct {
	ID       int    `json:"id"`
	Name     string `json:"name"`
	Position string `json:"position"`
	Phone    string `json:"phone"`
	Email    string `json:"email"`
	Dept     string `json:"dept"`
}

type Document struct {
	ID      int    `json:"id"`
	Title   string `json:"title"`
	Type    string `json:"type"`
	Updated string `json:"updated"`
}

func GetEmployees(c *gin.Context) {
	employees := []Employee{
		{1, "Иванов И.И.", "Инженер", "1234", "ivanov@tep.ru", "Тепломеханика"},
		{2, "Петрова А.С.", "Главный специалист", "5678", "petrova@tep.ru", "Электрика"},
	}
	c.JSON(http.StatusOK, employees)
}

func GetDocuments(c *gin.Context) {
	documents := []Document{
		{1, "ТУ-2025-001", "Технические условия", "2025-11-30"},
		{2, "ПЗ-2025-045", "Пояснительная записка", "2025-12-01"},
	}
	c.JSON(http.StatusOK, documents)
}