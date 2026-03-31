package handlers

import (
	"net/http"
	"sort"
	"strings"

	"github.com/gin-gonic/gin"
)

type AdminUserRow struct {
	FullName string `json:"fullName"`
	Username string `json:"username"`
	Email    string `json:"email"`
	Dept     string `json:"department"`
	Role     string `json:"role"`
}

func ListAdminUsers(c *gin.Context) {
	people, err := ListADUsers()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	roles, err := roleStore.All()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	out := make([]AdminUserRow, 0, len(people))
	for _, p := range people {
		u := normalizeUsername(p.Username)
		out = append(out, AdminUserRow{
			FullName: p.FullName,
			Username: u,
			Email:    p.Email,
			Dept:     p.Dept,
			Role:     normalizeRole(roles[u]),
		})
	}
	sort.Slice(out, func(i, j int) bool {
		return strings.ToLower(out[i].FullName) < strings.ToLower(out[j].FullName)
	})
	c.JSON(http.StatusOK, out)
}

func UpdateAdminUserRole(c *gin.Context) {
	username := normalizeUsername(c.Param("username"))
	if username == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "username required"})
		return
	}
	var body struct {
		Role string `json:"role"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid body"})
		return
	}
	role := normalizeRole(body.Role)
	if err := roleStore.Set(username, role); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true, "username": username, "role": role})
}

