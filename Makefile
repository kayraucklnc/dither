# Dither — `make help` lists everything.

.DEFAULT_GOAL := help
.PHONY: help setup dev firmware test goldens build

help: ## List the targets
	@awk 'BEGIN { FS = ":.*##" } /^[a-z-]+:.*##/ { printf "  \033[36m%-9s\033[0m %s\n", $$1, $$2 }' $(MAKEFILE_LIST)

setup: ## Install the app's dependencies
	cd app && npm install

dev: ## Run the app at http://localhost:5173
	cd app && npm run dev

firmware: ## Build the firmware and hand it to the app (needs uv)
	$(MAKE) -C firmware image

test: ## Every test: app, firmware host tests, shared golden images
	cd app && npm test && npx tsc -b
	$(MAKE) -C firmware test

goldens: ## Redraw spec/fixtures from the TypeScript runtime
	cd app && npm run goldens

build: firmware ## A static site in app/dist, firmware included
	cd app && npm run build
