install-extension:
	npm --prefix ./extension install

build-extension:
	npm --prefix ./extension run build:extension

test-extension:
	npm --prefix ./extension run test:unit

test-e2e:
	npm --prefix ./extension run test:e2e:runtime

test-ollama:
	npm --prefix ./ollama test

test-glm-ocr:
	pytest glm-ocr/tests/test_service_negative.py -v

test-all: test-extension test-e2e test-ollama test-glm-ocr

ollama-start:
	npm --prefix ./ollama run start:ollama
