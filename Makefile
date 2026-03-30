.PHONY: help install dev dev-mock frontend backend backend-mock build test test-server typecheck-server e2e docker-check compose-up compose-up-build compose-down compose-logs compose-ps clean

help:
	@printf "DockLite commands:\n"
	@printf "  make install           Install npm dependencies\n"
	@printf "  make dev               Run frontend + real Docker backend\n"
	@printf "  make dev-mock          Run frontend + mock backend\n"
	@printf "  make frontend          Run the Vite frontend only\n"
	@printf "  make backend           Run the backend against real Docker\n"
	@printf "  make backend-mock      Run the backend in mock mode\n"
	@printf "  make build             Build the frontend\n"
	@printf "  make test              Run frontend tests\n"
	@printf "  make test-server       Run backend tests\n"
	@printf "  make typecheck-server  Type-check the backend\n"
	@printf "  make e2e               Run the Playwright smoke test\n"
	@printf "  make docker-check      Verify Docker daemon access on Ubuntu\n"
	@printf "  make compose-up        Start frontend + backend with Docker Compose\n"
	@printf "  make compose-up-build  Start Compose stack with image rebuild\n"
	@printf "  make compose-down      Stop and remove Compose stack\n"
	@printf "  make compose-logs      Tail Compose logs\n"
	@printf "  make compose-ps        Show Compose services\n"
	@printf "  make clean             Remove build output\n"

install:
	npm install

dev:
	npm run dev:full

dev-mock:
	npm run dev:mock

frontend:
	npm run dev

backend:
	npm run server:dev

backend-mock:
	npm run server:dev:mock

build:
	npm run build

test:
	npm test

test-server:
	npm run server:test

typecheck-server:
	npm run server:typecheck

e2e:
	npm run test:e2e

docker-check:
	./server/scripts/check-docker-access.sh

compose-up:
	docker compose up -d

compose-up-build:
	docker compose up -d --build

compose-down:
	docker compose down

compose-logs:
	docker compose logs -f --tail=200

compose-ps:
	docker compose ps

clean:
	rm -rf dist test-results
