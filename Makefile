# Dither — developer entry point. Run `make help`.
#
# Every git worktree runs its own stack, on its own ports, against its own
# database. bin/dev works the assignment out and these targets wrap it, so two
# branches can be open in two browser tabs at once.

MAKEFLAGS += --no-print-directory

.DEFAULT_GOAL := help

DEV := bin/dev
SERVICE ?= web
ARGS ?=
NAME ?= Developer

.PHONY: help up down restart rebuild ps url open clean \
        logs shell console account migrate reset \
        test lint

##@ Getting started

help: ## List every target
	@awk 'BEGIN { FS = ":.*##" } \
	     /^##@/ { printf "\n\033[1m%s\033[0m\n", substr($$0, 5); next } \
	     /^[a-z][a-z0-9_-]*:.*##/ { printf "  \033[36m%-9s\033[0m %s\n", $$1, $$2 }' $(MAKEFILE_LIST)
	@printf '\n\033[1mThis worktree\033[0m\n  %s\n\n' "$$($(DEV) url)"
	@printf '  First run:  make up && make account EMAIL=you@example.com PASSWORD=...\n'
	@printf '  Then:       make open\n\n'

##@ Stack

up: ## Start this worktree's stack; prepares its database on first run
	@$(DEV) up

down: ## Stop this worktree's stack, keeping its database
	@$(DEV) down

restart: ## Restart web — Ruby changes under app/ are not hot-reloaded
	@$(DEV) restart web

rebuild: ## Rebuild images after a Gemfile or package.json change
	@$(DEV) build

ps: ## Show what is running for this worktree
	@$(DEV) ps

url: ## Print this worktree's URL
	@$(DEV) url

open: ## Open this worktree in a browser
	@$(DEV) open

clean: ## Delete this worktree's containers and database. Destructive
	@$(DEV) down --volumes

##@ Development

logs: ## Follow logs. SERVICE=assets for the CSS/JS watcher
	@$(DEV) logs --follow --tail 100 $(SERVICE)

shell: ## Open a shell in the web container
	@$(DEV) exec web bash

console: ## Open the Hanami console
	@$(DEV) exec web bundle exec hanami console

account: ## Register an account. EMAIL=... PASSWORD=... [NAME=...]
	@test -n "$(EMAIL)" && test -n "$(PASSWORD)" || { \
	  echo "usage: make account EMAIL=you@example.com PASSWORD=secret [NAME=\"Your Name\"]" >&2; \
	  exit 1; \
	}
	@$(DEV) account "$(EMAIL)" "$(PASSWORD)" "$(NAME)"

migrate: ## Run pending migrations
	@$(DEV) exec web bundle exec hanami db migrate

reset: ## Drop, recreate and reseed this worktree's database. Destructive
	@$(DEV) exec web bundle exec hanami db drop
	@$(DEV) exec web bundle exec hanami db prepare

##@ Quality

test: ## Run specs. ARGS=spec/features/login_spec.rb to narrow
	@$(DEV) exec -e HANAMI_ENV=test -e RACK_ENV=test web bundle exec rspec $(ARGS)

lint: ## Run RuboCop. ARGS=--autocorrect to fix
	@$(DEV) exec web bundle exec rubocop $(ARGS)
