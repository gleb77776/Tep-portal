package handlers

import (
	"errors"
	"net"
	"os"
	"strings"
	"sync"
	"time"

	"github.com/go-ldap/ldap/v3"
	"golang.org/x/sync/singleflight"
)

type adUserCacheEntry struct {
	user  *UserResponse
	err   error
	until time.Time
}

var (
	adUserCacheMu sync.Mutex
	adUserCache   = map[string]adUserCacheEntry{}
	adUserGroup   singleflight.Group
)

func parseEnvDuration(key string, def time.Duration) time.Duration {
	if v := strings.TrimSpace(os.Getenv(key)); v != "" {
		if d, err := time.ParseDuration(v); err == nil && d > 0 {
			return d
		}
	}
	return def
}

// ldapDialTimeout — таймаут TCP до контроллера домена (иначе «висит» десятки секунд).
func ldapDialTimeout() time.Duration {
	return parseEnvDuration("LDAP_DIAL_TIMEOUT", 2*time.Second)
}

// ldapOpTimeout — таймаут на bind/search по установленному соединению.
func ldapOpTimeout() time.Duration {
	return parseEnvDuration("LDAP_OP_TIMEOUT", 5*time.Second)
}

func ldapUserCacheOKTTL() time.Duration {
	return parseEnvDuration("LDAP_USER_CACHE_OK_TTL", 90*time.Second)
}

func ldapUserCacheErrTTL() time.Duration {
	return parseEnvDuration("LDAP_USER_CACHE_ERR_TTL", 15*time.Second)
}

// ldapOpen подключается к LDAP с коротким dial timeout и ограничением времени LDAP-операций.
func ldapOpen(ldapURL string) (*ldap.Conn, error) {
	d := &net.Dialer{Timeout: ldapDialTimeout()}
	conn, err := ldap.DialURL(ldapURL, ldap.DialWithDialer(d))
	if err != nil {
		return nil, err
	}
	conn.SetTimeout(ldapOpTimeout())
	return conn, nil
}

// fetchUserFromAD загружает пользователя из AD: кэш + singleflight (параллельные /user/me и /admin/access).
func fetchUserFromAD(username string) (*UserResponse, error) {
	key := strings.TrimSpace(normalizeSAMAccountName(username))
	if key == "" {
		return nil, errors.New("empty username")
	}

	now := time.Now()
	adUserCacheMu.Lock()
	ent, hit := adUserCache[key]
	if hit && now.Before(ent.until) {
		u, err := ent.user, ent.err
		adUserCacheMu.Unlock()
		if err != nil {
			return nil, err
		}
		if u != nil {
			out := *u
			return &out, nil
		}
		return nil, errors.New("ldap: user not found")
	}
	adUserCacheMu.Unlock()

	v, err, _ := adUserGroup.Do(key, func() (interface{}, error) {
		u, err := fetchUserFromADUncached(username)
		ttl := ldapUserCacheErrTTL()
		if err == nil && u != nil {
			ttl = ldapUserCacheOKTTL()
		}
		adUserCacheMu.Lock()
		adUserCache[key] = adUserCacheEntry{user: u, err: err, until: time.Now().Add(ttl)}
		adUserCacheMu.Unlock()
		return u, err
	})
	if err != nil {
		return nil, err
	}
	if v == nil {
		return nil, errors.New("nil ldap user")
	}
	u := v.(*UserResponse)
	out := *u
	return &out, nil
}

// invalidateAdUserCache сбрасывает кэш профиля (например после успешного /user/login).
func invalidateAdUserCache(username string) {
	key := strings.TrimSpace(normalizeSAMAccountName(username))
	if key == "" {
		return
	}
	adUserCacheMu.Lock()
	delete(adUserCache, key)
	adUserCacheMu.Unlock()
	adUserGroup.Forget(key)
}
