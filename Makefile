VERSION=$(shell jq -r .version package.json)
DATE=$(shell date +%F)

MD_FILES := $(wildcard articles/*.md)
HTML_FILES := $(patsubst articles/%.md,docs/%.html,$(MD_FILES))

all: docs $(HTML_FILES)

docs:
	mkdir -p docs

clean:
	rm -rf docs/*.html

docs/%.html: articles/%.md demo/template.html Makefile
	pandoc --toc -s --css src/reset.css --css src/index.css -Vversion=v$(VERSION) -Vdate=$(DATE) -i $< -o $@ --template=demo/template.html

.PHONY: all clean docs
