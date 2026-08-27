# Dither - developer entry point. Run `make help`.
#
# Two commands to a running dashboard:
#
#   make up     the shared database, this worktree's .env.local and dependencies
#   make dev    Next, on a port this worktree owns
#
# The database is shared on purpose. Every worktree talks to the one container
# compose.yml describes, so screens seeded in one branch are there in the next
# and nothing has to be set up twice. The port is not shared: bin/dev hands each
# worktree its own, so two branches can be open in two browser tabs at once.

MAKEFLAGS += --no-print-directory

.DEFAULT_GOAL := help

DEV := bin/dev
ARGS ?=

.PHONY: help up dev url open ps logs down psql push seed test lint verify

##@ Getting started

help: ## List every target
	@awk 'BEGIN { FS = ":.*##" } \
	     /^##@/ { printf "\n\033[1m%s\033[0m\n", substr($$0, 5); next } \
	     /^[a-z][a-z0-9_-]*:.*##/ { printf "  \033[36m%-7s\033[0m %s\n", $$1, $$2 }' $(MAKEFILE_LIST)
	@printf '\n\033[1mThis worktree\033[0m\n  %s\n\n' "$$($(DEV) url)"
	@printf '  make up && make dev\n\n'

up: ## Prepare this worktree: shared database, .env.local, dependencies
	@$(DEV) up

dev: ## Run this worktree's dev server, on its own port
	@$(DEV) dev

##@ Where it is

url: ## Print this worktree's URL
	@$(DEV) url

open: ## Open this worktree in a browser
	@$(DEV) open

##@ The shared database

ps: ## Show what is running
	@$(DEV) ps

logs: ## Follow the database log
	@$(DEV) logs --follow --tail 100 database

down: ## Stop the database. Every worktree loses it, and it keeps its data
	@$(DEV) stop database

psql: ## Open a prompt on the database
	@$(DEV) psql

push: ## Apply this branch's schema. ARGS=--force to skip the prompts
	@cd web && npx drizzle-kit push $(ARGS)

seed: ## Replace screens, devices and sources with the sample set. Destructive
	@cd web && npx tsx --env-file=.env.local scripts/seed.mts

##@ Quality

test: ## Run unit tests. ARGS=src/lib/money.test.ts to narrow
	@cd web && npx vitest run $(ARGS)

lint: ## Run eslint
	@cd web && npm run lint

verify: ## Check the firmware wire contract against the running server
	@cd web && npx tsx --env-file=.env.local scripts/verify-device-api.mts
