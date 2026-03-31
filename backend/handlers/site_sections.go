package handlers

import (
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"net/http"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strings"
	"sync"

	"github.com/gin-gonic/gin"
)

const HomeSectionsLimit = 6

const (
	TplProjects       = "projects"
	TplDocuments      = "documents"
	TplDocumentsVideo = "documents_video"
	TplSingleLink     = "single_link"
	TplMultiLinks     = "multi_links"
	TplLegacy         = "legacy"
	TplAllSections    = "all_sections"
)

type SiteSection struct {
	ID           string `json:"id"`
	Slug         string `json:"slug"`
	Title        string `json:"title"`
	Icon         string `json:"icon"`
	Template     string `json:"template"`
	Order        int    `json:"order"`
	ShowOnHome   bool   `json:"showOnHome"`
	HomeOrder    int    `json:"homeOrder"`
	LinkKey      string `json:"linkKey,omitempty"`
	ExternalURL  string `json:"externalUrl,omitempty"`
	InternalPath string `json:"internalPath,omitempty"`
	System       bool   `json:"system,omitempty"`
}

type SiteSectionPublic struct {
	SiteSection
	CardHref   string `json:"cardHref"`
	IsExternal bool   `json:"isExternal"`
}

var siteSectionsMu sync.RWMutex

var reservedSlugs = map[string]bool{
	"admin": true, "login": true, "api": true, "settings": true, "sections": true,
	"projects": true, "smk": true, "ohs": true, "kepr": true, "forms": true,
	"training": true, "licenses": true, "departments": true, "news": true,
	"it": true, "wiki": true, "skud": true, "sprut": true,
	"site-files": true, "s": true, "static": true,
}

var slugRe = regexp.MustCompile(`^[a-z0-9][a-z0-9_-]{0,62}$`)

func getSiteSectionsPath() string {
	path := os.Getenv("SITE_SECTIONS_PATH")
	if path == "" {
		cwd, _ := os.Getwd()
		for _, p := range []string{
			filepath.Join(cwd, "data", "site_sections.json"),
			filepath.Join(cwd, "..", "data", "site_sections.json"),
		} {
			if _, err := os.Stat(p); err == nil {
				return p
			}
		}
		path = filepath.Join(cwd, "data", "site_sections.json")
	}
	return path
}

func loadSiteSections() ([]SiteSection, error) {
	p := getSiteSectionsPath()
	data, err := os.ReadFile(p)
	if err != nil {
		if os.IsNotExist(err) {
			return defaultSiteSections(), nil
		}
		return nil, err
	}
	var list []SiteSection
	if err := json.Unmarshal(data, &list); err != nil {
		return nil, err
	}
	return list, nil
}

func saveSiteSections(list []SiteSection) error {
	p := getSiteSectionsPath()
	if err := os.MkdirAll(filepath.Dir(p), 0755); err != nil {
		return err
	}
	data, err := json.MarshalIndent(list, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(p, data, 0644)
}

func newSectionID() string {
	b := make([]byte, 16)
	if _, err := rand.Read(b); err != nil {
		return "sec-" + strings.ReplaceAll(filepath.Base(os.TempDir()), string(filepath.Separator), "")
	}
	return hex.EncodeToString(b)
}

func computeCardHref(s *SiteSection) (href string, external bool) {
	switch s.Template {
	case TplProjects:
		if strings.TrimSpace(s.InternalPath) != "" {
			return s.InternalPath, false
		}
		return "/projects", false
	case TplSingleLink:
		u := strings.TrimSpace(s.ExternalURL)
		if u != "" {
			if strings.HasPrefix(u, "http://") || strings.HasPrefix(u, "https://") || strings.HasPrefix(u, "file://") {
				return u, true
			}
		}
		return "#", false
	case TplLegacy, TplAllSections:
		if strings.TrimSpace(s.InternalPath) != "" {
			return s.InternalPath, false
		}
	case TplMultiLinks, TplDocuments, TplDocumentsVideo:
		if strings.TrimSpace(s.InternalPath) != "" {
			return s.InternalPath, false
		}
		if strings.TrimSpace(s.Slug) != "" {
			return "/s/" + strings.TrimPrefix(strings.TrimSpace(s.Slug), "/"), false
		}
	}
	return "#", false
}

func toPublic(list []SiteSection) []SiteSectionPublic {
	out := make([]SiteSectionPublic, 0, len(list))
	for i := range list {
		href, ext := computeCardHref(&list[i])
		out = append(out, SiteSectionPublic{SiteSection: list[i], CardHref: href, IsExternal: ext})
	}
	return out
}

func ListSiteSectionsPublic(c *gin.Context) {
	siteSectionsMu.RLock()
	list, err := loadSiteSections()
	siteSectionsMu.RUnlock()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	sort.Slice(list, func(i, j int) bool { return list[i].Order < list[j].Order })
	c.JSON(http.StatusOK, toPublic(list))
}

func GetSiteSectionBySlugPublic(c *gin.Context) {
	slug := strings.TrimSpace(c.Param("slug"))
	if slug == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "slug required"})
		return
	}
	siteSectionsMu.RLock()
	list, err := loadSiteSections()
	siteSectionsMu.RUnlock()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	for i := range list {
		if list[i].Slug == slug {
			href, ext := computeCardHref(&list[i])
			c.JSON(http.StatusOK, SiteSectionPublic{SiteSection: list[i], CardHref: href, IsExternal: ext})
			return
		}
	}
	c.JSON(http.StatusNotFound, gin.H{"error": "not found"})
}

func FindDynamicSectionBySlug(slug string) (*SiteSection, error) {
	siteSectionsMu.RLock()
	defer siteSectionsMu.RUnlock()
	list, err := loadSiteSections()
	if err != nil {
		return nil, err
	}
	for i := range list {
		if list[i].Slug == slug && (list[i].Template == TplDocuments || list[i].Template == TplDocumentsVideo) {
			return &list[i], nil
		}
	}
	return nil, os.ErrNotExist
}

func validateTemplate(t string) bool {
	switch t {
	case TplProjects, TplDocuments, TplDocumentsVideo, TplSingleLink, TplMultiLinks, TplLegacy, TplAllSections:
		return true
	}
	return false
}

type createSiteSectionBody struct {
	Title       string `json:"title"`
	Icon        string `json:"icon"`
	Template    string `json:"template"`
	Slug        string `json:"slug"`
	ExternalURL string `json:"externalUrl"`
	LinkKey     string `json:"linkKey"`
	ShowOnHome  bool   `json:"showOnHome"`
	HomeOrder   int    `json:"homeOrder"`
}

func AdminCreateSiteSection(c *gin.Context) {
	var body createSiteSectionBody
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid body"})
		return
	}
	body.Title = strings.TrimSpace(body.Title)
	body.Icon = strings.TrimSpace(body.Icon)
	body.Slug = strings.TrimSpace(strings.ToLower(body.Slug))
	body.Template = strings.TrimSpace(body.Template)
	if body.Title == "" || !validateTemplate(body.Template) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "title and valid template required"})
		return
	}
	if body.Slug == "" || !slugRe.MatchString(body.Slug) || reservedSlugs[body.Slug] {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid or reserved slug"})
		return
	}

	siteSectionsMu.Lock()
	defer siteSectionsMu.Unlock()
	list, err := loadSiteSections()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	for _, s := range list {
		if s.Slug == body.Slug {
			c.JSON(http.StatusBadRequest, gin.H{"error": "slug already exists"})
			return
		}
	}
	maxOrder := 0
	maxHomeOrder := 0
	for _, s := range list {
		if s.Order > maxOrder {
			maxOrder = s.Order
		}
		if s.HomeOrder > maxHomeOrder {
			maxHomeOrder = s.HomeOrder
		}
	}
	sec := SiteSection{
		ID:         newSectionID(),
		Slug:       body.Slug,
		Title:      body.Title,
		Icon:       body.Icon,
		Template:   body.Template,
		Order:      maxOrder + 1,
		ShowOnHome: body.ShowOnHome,
		HomeOrder:  0,
	}
	if body.ShowOnHome {
		sec.HomeOrder = maxHomeOrder + 1
	}
	switch body.Template {
	case TplProjects:
		sec.InternalPath = "/s/" + body.Slug
		if err := InitEmptySectionProjectsStorage(sec.ID); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
	case TplSingleLink:
		sec.ExternalURL = strings.TrimSpace(body.ExternalURL)
		sec.LinkKey = strings.TrimSpace(body.LinkKey)
		if msg, ok := validateLicenseLink(body.Title, sec.ExternalURL); !ok {
			c.JSON(http.StatusBadRequest, gin.H{"error": msg})
			return
		}
	case TplDocuments, TplDocumentsVideo:
		root := filepath.Join(resolveDataDir(), "site_sections", body.Slug)
		if err := os.MkdirAll(root, 0755); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		sec.InternalPath = "/s/" + body.Slug
	case TplMultiLinks:
		sec.InternalPath = "/s/" + body.Slug
		if err := saveSectionMenuItems(sec.ID, []LicenseLink{}); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
	default:
		c.JSON(http.StatusBadRequest, gin.H{"error": "template not allowed for new section"})
		return
	}

	list = append(list, sec)
	if err := saveSiteSections(list); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	href, ext := computeCardHref(&sec)
	c.JSON(http.StatusOK, SiteSectionPublic{SiteSection: sec, CardHref: href, IsExternal: ext})
}

type updateSiteSectionBody struct {
	Title       string `json:"title"`
	Icon        string `json:"icon"`
	ShowOnHome  *bool  `json:"showOnHome"`
	HomeOrder   *int   `json:"homeOrder"`
	ExternalURL string `json:"externalUrl"`
	LinkKey     string `json:"linkKey"`
}

func AdminUpdateSiteSection(c *gin.Context) {
	id := strings.TrimSpace(c.Param("id"))
	var body updateSiteSectionBody
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid body"})
		return
	}
	siteSectionsMu.Lock()
	defer siteSectionsMu.Unlock()
	list, err := loadSiteSections()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	found := -1
	for i := range list {
		if list[i].ID == id {
			found = i
			break
		}
	}
	if found < 0 {
		c.JSON(http.StatusNotFound, gin.H{"error": "not found"})
		return
	}
	s := &list[found]
	if strings.TrimSpace(body.Title) != "" {
		s.Title = strings.TrimSpace(body.Title)
	}
	if strings.TrimSpace(body.Icon) != "" {
		s.Icon = strings.TrimSpace(body.Icon)
	}
	if body.ShowOnHome != nil {
		s.ShowOnHome = *body.ShowOnHome
	}
	if body.HomeOrder != nil {
		s.HomeOrder = *body.HomeOrder
	}
	if s.Template == TplSingleLink {
		if strings.TrimSpace(body.ExternalURL) != "" {
			if msg, ok := validateLicenseLink(s.Title, body.ExternalURL); !ok {
				c.JSON(http.StatusBadRequest, gin.H{"error": msg})
				return
			}
			s.ExternalURL = strings.TrimSpace(body.ExternalURL)
		}
		if strings.TrimSpace(body.LinkKey) != "" {
			s.LinkKey = strings.TrimSpace(body.LinkKey)
		}
	}
	if err := saveSiteSections(list); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	href, ext := computeCardHref(s)
	c.JSON(http.StatusOK, SiteSectionPublic{SiteSection: *s, CardHref: href, IsExternal: ext})
}

func AdminDeleteSiteSection(c *gin.Context) {
	id := strings.TrimSpace(c.Param("id"))
	siteSectionsMu.Lock()
	defer siteSectionsMu.Unlock()
	list, err := loadSiteSections()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	next := make([]SiteSection, 0, len(list))
	var deleted *SiteSection
	for i := range list {
		if list[i].ID == id {
			if list[i].System {
				c.JSON(http.StatusBadRequest, gin.H{"error": "system section cannot be deleted"})
				return
			}
			cp := list[i]
			deleted = &cp
			continue
		}
		next = append(next, list[i])
	}
	if deleted == nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "not found"})
		return
	}
	if err := saveSiteSections(next); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	slug := strings.TrimSpace(deleted.Slug)
	if slug != "" {
		_ = os.RemoveAll(filepath.Join(resolveDataDir(), "site_sections", slug))
	}
	if deleted.Template == TplProjects {
		_ = RemoveSectionProjectsStorage(deleted.ID)
	}
	if deleted.Template == TplMultiLinks {
		_ = os.Remove(getSectionMenuPath(deleted.ID))
	}
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

type reorderBody struct {
	IDs []string `json:"ids"`
}

func AdminReorderSiteSections(c *gin.Context) {
	var body reorderBody
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid body"})
		return
	}
	siteSectionsMu.Lock()
	defer siteSectionsMu.Unlock()
	list, err := loadSiteSections()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	byID := make(map[string]*SiteSection)
	for i := range list {
		byID[list[i].ID] = &list[i]
	}
	for i, id := range body.IDs {
		if s, ok := byID[id]; ok {
			s.Order = i
		}
	}
	if err := saveSiteSections(list); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

func AdminReorderHomeSections(c *gin.Context) {
	var body reorderBody
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid body"})
		return
	}
	siteSectionsMu.Lock()
	defer siteSectionsMu.Unlock()
	list, err := loadSiteSections()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	byID := make(map[string]*SiteSection)
	for i := range list {
		byID[list[i].ID] = &list[i]
	}
	for i, id := range body.IDs {
		if s, ok := byID[id]; ok {
			s.HomeOrder = i
			s.ShowOnHome = true
		}
	}
	if err := saveSiteSections(list); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

func resolveDataDir() string {
	if env := os.Getenv("SITE_SECTIONS_PATH"); env != "" {
		return filepath.Dir(env)
	}
	cwd, _ := os.Getwd()
	for _, p := range []string{
		filepath.Join(cwd, "data", "site_sections.json"),
		filepath.Join(cwd, "..", "data", "site_sections.json"),
	} {
		if _, err := os.Stat(p); err == nil {
			abs, _ := filepath.Abs(filepath.Dir(p))
			return abs
		}
	}
	fallback := filepath.Join(cwd, "data", "site_sections.json")
	abs, _ := filepath.Abs(filepath.Dir(fallback))
	return abs
}

func defaultSiteSections() []SiteSection {
	return []SiteSection{
		{ID: "sys-projects", Slug: "projects", Title: "ПРОЕКТЫ", Icon: "📊", Template: TplProjects, Order: 0, ShowOnHome: true, HomeOrder: 0, InternalPath: "/projects", System: true},
		{ID: "sys-it", Slug: "it", Title: "ЗАЯВКА В IT", Icon: "💻", Template: TplSingleLink, Order: 1, ShowOnHome: true, HomeOrder: 1, LinkKey: "it", ExternalURL: "http://tepmapp12/inframanager/SD/ServiceCatalogue", System: true},
		{ID: "sys-smk", Slug: "smk", Title: "СМК", Icon: "📄", Template: TplLegacy, Order: 2, ShowOnHome: true, HomeOrder: 2, InternalPath: "/smk", System: true},
		{ID: "sys-ohs", Slug: "ohs", Title: "ОХРАНА ТРУДА, ГО И ЧС", Icon: "📋", Template: TplLegacy, Order: 3, ShowOnHome: true, HomeOrder: 3, InternalPath: "/ohs", System: true},
		{ID: "sys-kepr", Slug: "kepr", Title: "КЭПР", Icon: "📘", Template: TplLegacy, Order: 4, ShowOnHome: true, HomeOrder: 4, InternalPath: "/kepr", System: true},
		{ID: "sys-wiki", Slug: "wiki", Title: "TEP-WIKI", Icon: "📖", Template: TplSingleLink, Order: 5, ShowOnHome: true, HomeOrder: 5, LinkKey: "wiki", ExternalURL: "http://tepmapp25:5003/doku.php?id=start", System: true},
		{ID: "sys-skud", Slug: "skud", Title: "СКУД", Icon: "⏰", Template: TplSingleLink, Order: 6, ShowOnHome: false, HomeOrder: 20, LinkKey: "skud", ExternalURL: "file://tep-m.ru/data/App/TimeSheet/skud/skud.run.cmd", System: true},
		{ID: "sys-sprut", Slug: "sprut", Title: "СПРУТ", Icon: "📈", Template: TplSingleLink, Order: 7, ShowOnHome: false, HomeOrder: 21, LinkKey: "sprut", ExternalURL: "file://tep-m.ru/data/App/TimeSheet/sprut/sprut.run.cmd", System: true},
		{ID: "sys-forms", Slug: "forms", Title: "БЛАНКИ", Icon: "📑", Template: TplLegacy, Order: 8, ShowOnHome: false, HomeOrder: 22, InternalPath: "/forms", System: true},
		{ID: "sys-training", Slug: "training", Title: "Записи с программ обучения", Icon: "🎓", Template: TplLegacy, Order: 9, ShowOnHome: false, HomeOrder: 23, InternalPath: "/training", System: true},
		{ID: "sys-licenses", Slug: "licenses", Title: "ЛИЦЕНЗИИ, ПРОГРАММЫ", Icon: "📋", Template: TplMultiLinks, Order: 10, ShowOnHome: false, HomeOrder: 99, InternalPath: "/licenses", System: true},
		{ID: "sys-all", Slug: "all-sections", Title: "ВСЕ РАЗДЕЛЫ", Icon: "📚", Template: TplAllSections, Order: 12, ShowOnHome: true, HomeOrder: 50, InternalPath: "/sections", System: true},
	}
}

