package main

import (
	"log"
	"os"
	"path/filepath"
	"strings"
	"tep-portal/handlers"

	"github.com/gin-gonic/gin"
	"github.com/joho/godotenv"
)

// registerHomeHeroAssets отдаёт файлы из frontend/public по корню URL (прокси Vite, прямой заход на :8000 и т.д.).
func registerHomeHeroAssets(r *gin.Engine) {
	if envDir := strings.TrimSpace(os.Getenv("FRONTEND_PUBLIC_DIR")); envDir != "" {
		if registerHeroFromDir(r, envDir) {
			return
		}
		log.Printf("Главная: FRONTEND_PUBLIC_DIR=%q не найден или без home-hero.*, ищем рядом с cwd\n", envDir)
	}
	wd, err := os.Getwd()
	if err != nil {
		log.Printf("Главная: не удалось определить cwd для home-hero: %v\n", err)
		return
	}
	dirs := []string{
		filepath.Join(wd, "..", "frontend", "public"),
		filepath.Join(wd, "frontend", "public"),
		filepath.Join(wd, "..", "..", "frontend", "public"),
	}
	if exe, e := os.Executable(); e == nil {
		exedir := filepath.Dir(exe)
		dirs = append(dirs,
			filepath.Join(exedir, "..", "frontend", "public"),
			filepath.Join(exedir, "frontend", "public"),
		)
	}
	for _, d := range dirs {
		if registerHeroFromDir(r, d) {
			return
		}
	}
	log.Printf("Главная: home-hero.mov/mp4 не найдены (cwd=%s). Задайте FRONTEND_PUBLIC_DIR или запускайте бэкенд из папки backend.\n", wd)
}

func registerHeroFromDir(r *gin.Engine, pubDir string) bool {
	if st, e := os.Stat(pubDir); e != nil || !st.IsDir() {
		return false
	}
	registered := false
	for _, name := range []string{"home-hero.mp4", "home-hero.mov"} {
		p := filepath.Join(pubDir, name)
		if st, e := os.Stat(p); e == nil && !st.IsDir() {
			route := "/" + name
			r.StaticFile(route, p)
			log.Printf("Главная: раздача %s → %s\n", route, p)
			registered = true
		}
	}
	return registered
}

func main() {
	// Если `.env` отсутствует, но есть `.env.example`, возьмём настройки оттуда (для dev).
	if err := godotenv.Load(); err != nil {
		_ = godotenv.Load(".env.example")
	}
	if err := handlers.InitRoleStore(); err != nil {
		log.Fatalf("инициализация хранилища ролей: %v", err)
	}
	r := gin.Default()
	r.Use(func(c *gin.Context) {
		c.Header("Access-Control-Allow-Origin", "*")
		c.Header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
		c.Header("Access-Control-Allow-Headers", "Content-Type, Authorization")
		if c.Request.Method == "OPTIONS" {
			c.AbortWithStatus(204)
			return
		}
		c.Next()
	})

	// API маршруты (без кэша: браузер/прокси не должны отдавать старый список разделов и т.п.)
	api := r.Group("/api/v1")
	api.Use(func(c *gin.Context) {
		c.Header("Cache-Control", "no-store, no-cache, must-revalidate")
		c.Header("Pragma", "no-cache")
		c.Next()
	})
	{
		api.GET("/employees", handlers.GetEmployees)
		api.GET("/documents", handlers.GetDocuments)
		api.GET("/user/me", handlers.GetCurrentUser)
		api.POST("/user/login", handlers.UserLogin)
		api.GET("/diagrams", handlers.ListDiagrams)
		api.GET("/projects", handlers.ListProjects)
		api.GET("/projects/:projectId/documents", handlers.ListProjectDocuments)
		api.GET("/smk/list", handlers.ListSMK)
		api.POST("/smk/folder", handlers.CreateSMKFolder)
		api.POST("/smk/upload", handlers.UploadSMKFile)

		api.GET("/ot/list", handlers.ListOT)

		api.GET("/kepr/list", handlers.ListKEPR)

		api.GET("/forms/list", handlers.ListForms)
		api.GET("/training/list", handlers.ListTraining)

		api.GET("/news", handlers.ListNews)
		api.GET("/links", handlers.ListLinks)
		api.GET("/section-card-links", handlers.ListSectionCardLinks)
		api.GET("/licenses-links", handlers.ListLicensesLinks)
		api.GET("/site-sections", handlers.ListSiteSectionsPublic)
		api.GET("/site-sections/slug/:slug", handlers.GetSiteSectionBySlugPublic)
		api.GET("/site-sections/dynamic/:slug/list", handlers.ListDynamicDocs)
		api.GET("/section-menus/:sectionId", handlers.ListSectionMenu)
		api.GET("/site-sections/scoped/:slug/projects", handlers.ListScopedProjects)
		api.GET("/site-sections/scoped/:slug/projects/:projectId/documents", handlers.ListScopedProjectDocuments)
		api.GET("/debug/identity", handlers.DebugRequestIdentity)
		api.POST("/admin/login", handlers.AdminLogin)
		api.GET("/admin/access", handlers.GetAdminAccess)
		api.GET("/debug/ad-user", handlers.RequireAdministrator, handlers.DebugADUser)
		api.GET("/debug/ad-search", handlers.RequireAdministrator, handlers.DebugADSearch)
		api.GET("/health", func(c *gin.Context) {
			c.JSON(200, gin.H{"ok": true})
		})

		admin := api.Group("/admin", handlers.RequireAdmin)
		{
			admin.GET("/users", handlers.RequireAdministrator, handlers.ListAdminUsers)
			admin.PUT("/users/:username/role", handlers.RequireAdministrator, handlers.UpdateAdminUserRole)
			// СМК в админке — первыми (короткие пути без /smk/folder, чтобы не путать прокси/nginx)
			admin.POST("/smk-folder", handlers.RequireAdminOrDocumentation, handlers.AdminCreateSMKFolder)
			admin.POST("/smk-upload", handlers.RequireAdminOrDocumentation, handlers.AdminUploadSMKFile)
			admin.DELETE("/smk-item", handlers.RequireAdministrator, handlers.AdminDeleteSMKItem)
			// Старые пути — на случай совместимости
			admin.POST("/smk/folder", handlers.RequireAdminOrDocumentation, handlers.AdminCreateSMKFolder)
			admin.POST("/smk/upload", handlers.RequireAdminOrDocumentation, handlers.AdminUploadSMKFile)
			admin.DELETE("/smk/item", handlers.RequireAdministrator, handlers.AdminDeleteSMKItem)

			admin.POST("/ot-folder", handlers.RequireAdminOrSafetyOT, handlers.AdminCreateOTFolder)
			admin.POST("/ot-upload", handlers.RequireAdminOrSafetyOT, handlers.AdminUploadOTFile)
			admin.DELETE("/ot-item", handlers.RequireAdminOrSafetyOT, handlers.AdminDeleteOTItem)

			admin.POST("/kepr-folder", handlers.RequireAdminOrDocumentation, handlers.AdminCreateKEPRFolder)
			admin.POST("/kepr-upload", handlers.RequireAdminOrDocumentation, handlers.AdminUploadKEPRFile)
			admin.DELETE("/kepr-item", handlers.RequireAdministrator, handlers.AdminDeleteKEPRItem)

			admin.POST("/forms-folder", handlers.RequireFormsEditor, handlers.AdminCreateFormsFolder)
			admin.POST("/forms-upload", handlers.RequireFormsEditor, handlers.AdminUploadFormsFile)
			admin.DELETE("/forms-item", handlers.RequireFormsEditor, handlers.AdminDeleteFormsItem)

			admin.POST("/training-folder", handlers.RequireAdministrator, handlers.AdminCreateTrainingFolder)
			admin.POST("/training-upload", handlers.RequireAdministrator, handlers.AdminUploadTrainingFile)
			admin.DELETE("/training-item", handlers.RequireAdministrator, handlers.AdminDeleteTrainingItem)

			admin.GET("/projects", handlers.RequireAdminOrDocumentation, handlers.ListAdminProjects)
			admin.POST("/projects", handlers.RequireAdminOrDocumentation, handlers.CreateAdminProject)
			admin.PUT("/projects/:id/visibility", handlers.RequireAdministrator, handlers.SetProjectVisibility)
			// Удаление проекта в текущей реализации = скрыть из выдачи сайта.
			// Сделано более специфичным, чтобы не конфликтовать с роутами файлов.
			admin.DELETE("/projects/:id/hide", handlers.RequireAdministrator, handlers.HideProject)

			admin.GET("/projects/:id/files", handlers.RequireAdminOrDocumentation, handlers.ListAdminProjectFiles)
			admin.POST("/projects/:id/files", handlers.RequireAdminOrDocumentation, handlers.UploadProjectFile)
			admin.DELETE("/projects/:id/files/:docId", handlers.RequireAdministrator, handlers.DeleteProjectFile)

			admin.POST("/news", handlers.RequireNewsLinksEditor, handlers.CreateNews)
			admin.POST("/news/reorder", handlers.RequireNewsLinksEditor, handlers.ReorderNews)
			admin.PUT("/news/:id", handlers.RequireNewsLinksEditor, handlers.UpdateNews)
			admin.DELETE("/news/:id", handlers.RequireNewsLinksEditor, handlers.DeleteNews)
			admin.POST("/links", handlers.RequireNewsLinksEditor, handlers.CreateLink)
			admin.POST("/links/reorder", handlers.RequireNewsLinksEditor, handlers.ReorderLinks)
			admin.PUT("/links/:id", handlers.RequireNewsLinksEditor, handlers.UpdateLink)
			admin.DELETE("/links/:id", handlers.RequireNewsLinksEditor, handlers.DeleteLink)

			admin.PUT("/section-card-links/:key", handlers.RequireAdministrator, handlers.AdminPutSectionCardLink)

			admin.POST("/site-sections", handlers.RequireAdministrator, handlers.AdminCreateSiteSection)
			admin.PUT("/site-sections/:id", handlers.RequireAdministrator, handlers.AdminUpdateSiteSection)
			admin.DELETE("/site-sections/:id", handlers.RequireAdministrator, handlers.AdminDeleteSiteSection)
			admin.POST("/site-sections/reorder", handlers.RequireAdministrator, handlers.AdminReorderSiteSections)
			admin.POST("/site-sections/reorder-home", handlers.RequireAdministrator, handlers.AdminReorderHomeSections)
			admin.POST("/site-sections/dynamic/:slug/folder", handlers.RequireAdministratorOrDocumentationDynamicSRO, handlers.AdminCreateDynamicFolder)
			admin.POST("/site-sections/dynamic/:slug/upload", handlers.RequireDocumentationUploader, handlers.AdminUploadDynamicFile)
			admin.DELETE("/site-sections/dynamic/:slug/item", handlers.RequireAdministrator, handlers.AdminDeleteDynamicItem)
			admin.PUT("/section-menus/:sectionId", handlers.RequireAdministrator, handlers.AdminPutSectionMenu)

			admin.GET("/site-sections/scoped/:slug/projects", handlers.RequireScopedProjectsForDocumentation, handlers.ListAdminScopedProjects)
			admin.POST("/site-sections/scoped/:slug/projects", handlers.RequireScopedProjectsForDocumentation, handlers.CreateAdminScopedProject)
			admin.GET("/site-sections/scoped/:slug/projects/:id/files", handlers.RequireScopedProjectsForDocumentation, handlers.ListAdminScopedProjectFiles)
			admin.POST("/site-sections/scoped/:slug/projects/:id/files", handlers.RequireScopedProjectsForDocumentation, handlers.UploadScopedProjectFile)
			admin.DELETE("/site-sections/scoped/:slug/projects/:id/files/:docId", handlers.RequireAdministrator, handlers.DeleteScopedProjectFile)

			admin.POST("/licenses-links", handlers.RequireAdministrator, handlers.AdminCreateLicenseLink)
			admin.PUT("/licenses-links/:id", handlers.RequireAdministrator, handlers.AdminUpdateLicenseLink)
			admin.DELETE("/licenses-links/:id", handlers.RequireAdministrator, handlers.AdminDeleteLicenseLink)
			admin.POST("/licenses-links/reorder", handlers.RequireAdministrator, handlers.AdminReorderLicenseLinks)
		}
	}

	// Статические файлы документов проектов (загруженные через админку)
	projectFilesRoot := os.Getenv("PROJECT_DOCS_FILES_PATH")
	if projectFilesRoot == "" {
		if wd, err := os.Getwd(); err == nil {
			projectFilesRoot = filepath.Join(wd, "..", "data", "project_files_admin")
		}
	}
	if projectFilesRoot != "" {
		r.Static("/project-files", projectFilesRoot)
	}

	// Статические файлы диаграмм (data/diagrams в корне проекта)
	diagramsPath := os.Getenv("DIAGRAMS_PATH")
	if diagramsPath == "" {
		if wd, err := os.Getwd(); err == nil {
			p := filepath.Join(wd, "..", "data", "diagrams")
			if _, err := os.Stat(p); err == nil {
				diagramsPath = p
			} else {
				diagramsPath = filepath.Join(wd, "data", "diagrams")
			}
		}
	}
	if diagramsPath != "" {
		r.Static("/diagrams", diagramsPath)
	}

	// Статические файлы СМК (data/smk)
	smkPath := os.Getenv("SMK_PATH")
	if smkPath == "" {
		if wd, err := os.Getwd(); err == nil {
			p := filepath.Join(wd, "..", "data", "smk")
			if _, err := os.Stat(p); err == nil {
				smkPath = p
			} else {
				smkPath = filepath.Join(wd, "data", "smk")
			}
		}
	}
	if smkPath != "" {
		r.Static("/smk/files", smkPath)
	}

	// Статические файлы «Охрана труда, ГО и ЧС»
	otPath := os.Getenv("OT_DOCS_PATH")
	if otPath == "" {
		if wd, err := os.Getwd(); err == nil {
			p := filepath.Join(wd, "..", "data", "ot_go_chs")
			if _, err := os.Stat(p); err == nil {
				otPath = p
			} else {
				otPath = filepath.Join(wd, "data", "ot_go_chs")
			}
		}
	}
	if otPath != "" {
		r.Static("/ot/files", otPath)
	}

	// Статические файлы КЭПР
	keprPath := os.Getenv("KEPR_DOCS_PATH")
	if keprPath == "" {
		if wd, err := os.Getwd(); err == nil {
			p := filepath.Join(wd, "..", "data", "kepr")
			if _, err := os.Stat(p); err == nil {
				keprPath = p
			} else {
				keprPath = filepath.Join(wd, "data", "kepr")
			}
		}
	}
	if keprPath != "" {
		r.Static("/kepr/files", keprPath)
	}

	// Бланки
	formsPath := os.Getenv("FORMS_DOCS_PATH")
	if formsPath == "" {
		if wd, err := os.Getwd(); err == nil {
			p := filepath.Join(wd, "..", "data", "forms")
			if _, err := os.Stat(p); err == nil {
				formsPath = p
			} else {
				formsPath = filepath.Join(wd, "data", "forms")
			}
		}
	}
	if formsPath != "" {
		r.Static("/forms/files", formsPath)
	}

	// Записи с программ обучения
	trainingPath := os.Getenv("TRAINING_DOCS_PATH")
	if trainingPath == "" {
		if wd, err := os.Getwd(); err == nil {
			p := filepath.Join(wd, "..", "data", "training")
			if _, err := os.Stat(p); err == nil {
				trainingPath = p
			} else {
				trainingPath = filepath.Join(wd, "data", "training")
			}
		}
	}
	if trainingPath != "" {
		r.Static("/training/files", trainingPath)
	}

	r.GET("/site-files/:slug/*filepath", handlers.ServeDynamicFile)
	r.GET("/section-project-files/:sectionId/:projectId/*filepath", handlers.ServeSectionProjectFile)

	// Видео главной: `frontend/public/home-hero.mov` (и при необходимости `.mp4`) — доступно по `/home-hero.*` с того же хоста, что и API.
	registerHomeHeroAssets(r)

	port := os.Getenv("PORT")
	if port == "" {
		port = "8000"
	}
	addr := ":" + port
	log.Printf("HTTP-сервер: http://localhost%s (если «address already in use» — освободите порт или задайте PORT в .env)\n", addr)
	if err := r.Run(addr); err != nil {
		log.Fatal(err)
	}
}