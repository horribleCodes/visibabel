install-extension:
	npm --prefix ./extension install

build-extension:
	npm --prefix ./extension run build:extension

package-extension:
	build-extension
	npm --prefix ./extension run package:zip

test-extension:
	npm --prefix ./extension run test:unit

test-e2e:
	npm --prefix ./extension run test:e2e:runtime

install-ollama:
	npm --prefix ./ollama install

ollama-start:
	npm --prefix ./ollama run start:ollama

test-ollama: install-ollama
	npm --prefix ./ollama test

test-glm-ocr:
	pytest glm-ocr/tests/test_service_negative.py -v

test-all:
	test-extension test-e2e test-ollama test-glm-ocr
