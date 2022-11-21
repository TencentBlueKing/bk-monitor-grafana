package database

import (
	"context"
	"strings"
	"time"

	"github.com/prometheus/client_golang/prometheus"

	"github.com/grafana/grafana/pkg/infra/db"
	"github.com/grafana/grafana/pkg/services/login"
)

func InitMetrics() {
	login.Once.Do(func() {
		login.MStatDuplicateUserEntries = prometheus.NewGauge(prometheus.GaugeOpts{
			Name:      "stat_users_total_duplicate_user_entries",
			Help:      "total number of duplicate user entries by email or login",
			Namespace: login.ExporterName,
		})

		login.MStatHasDuplicateEntries = prometheus.NewGauge(prometheus.GaugeOpts{
			Name:      "stat_users_has_duplicate_user_entries",
			Help:      "instance has duplicate user entries by email or login",
			Namespace: login.ExporterName,
		})

		login.MStatMixedCasedUsers = prometheus.NewGauge(prometheus.GaugeOpts{
			Name:      "stat_users_total_mixed_cased_users",
			Help:      "total number of users with upper and lower case logins or emails",
			Namespace: login.ExporterName,
		})

		prometheus.MustRegister(
			login.MStatDuplicateUserEntries,
			login.MStatHasDuplicateEntries,
			login.MStatMixedCasedUsers,
		)
	})
}

func (s *AuthInfoStore) RunMetricsCollection(ctx context.Context) error {
	if _, err := s.GetLoginStats(ctx); err != nil {
		s.logger.Warn("Failed to get authinfo metrics", "error", err.Error())
	}
	updateStatsTicker := time.NewTicker(login.MetricsCollectionInterval)
	defer updateStatsTicker.Stop()

	for {
		select {
		case <-updateStatsTicker.C:
			if _, err := s.GetLoginStats(ctx); err != nil {
				s.logger.Warn("Failed to get authinfo metrics", "error", err.Error())
			}
		case <-ctx.Done():
			return ctx.Err()
		}
	}
}

func (s *AuthInfoStore) GetLoginStats(ctx context.Context) (login.LoginStats, error) {
	var stats login.LoginStats

	var users []struct {
		login string
		email string
	}
	outerErr := s.sqlStore.WithDbSession(ctx, func(dbSession *db.Session) error {
		sess := dbSession.Table("user").Cols("login", "email")
		_, err := sess.Get(users)
		return err
	})
	if outerErr != nil {
		return stats, outerErr
	}

	emails, logins := make(map[string]bool), make(map[string]bool)
	for _, user := range users {
		emailLower, loginLower := strings.ToLower(user.email), strings.ToLower(user.login)

		// this query counts how many users have upper case and lower case login or emails.
		// why
		// users login via IDP or service providers get upper cased domains at times :shrug:
		if emailLower == user.email || loginLower == user.login {
			stats.MixedCasedUsers += 1
		}

		// counts how many users have the same login or email.
		if _, exists := emails[emailLower]; exists {
			stats.DuplicateUserEntries += 1
			continue
		} else {
			emails[emailLower] = true
		}

		if _, exists := logins[loginLower]; exists {
			stats.DuplicateUserEntries += 1
			continue
		} else {
			logins[loginLower] = true
		}
	}

	login.MStatMixedCasedUsers.Set(float64(stats.MixedCasedUsers))
	return stats, nil
}

func (s *AuthInfoStore) CollectLoginStats(ctx context.Context) (map[string]interface{}, error) {
	m := map[string]interface{}{}

	loginStats, err := s.GetLoginStats(ctx)
	if err != nil {
		s.logger.Error("Failed to get login stats", "error", err)
		return nil, err
	}
	m["stats.users.duplicate_user_entries"] = loginStats.DuplicateUserEntries
	if loginStats.DuplicateUserEntries > 0 {
		m["stats.users.has_duplicate_user_entries"] = 1
	} else {
		m["stats.users.has_duplicate_user_entries"] = 0
	}
	m["stats.users.mixed_cased_users"] = loginStats.MixedCasedUsers

	return m, nil
}
