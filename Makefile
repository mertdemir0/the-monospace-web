VERSION=$(shell jq -r .version package.json)
DATE=$(shell date +%F)

MD_FILES := $(wildcard articles/*.md)
HTML_FILES := $(patsubst articles/%.md,docs/%.html,$(MD_FILES))

all: docs $(HTML_FILES) docs/index.html

docs:
	mkdir -p docs

clean:
	rm -rf docs/*.html

docs/%.html: articles/%.md demo/template.html Makefile
	pandoc --toc -s --css src/reset.css --css src/index.css -Vversion=v$(VERSION) -Vdate=$(DATE) -i $< -o $@ --template=demo/template.html

docs/index.html: demo/index.html
	cp demo/index.html docs/index.html

#docs/index.html: demo/landing-template.html scripts/collect-articles.lua Makefile $(MD_FILES)
#	pandoc --toc -s --css src/reset.css --css src/index.css --css src/landing.css \
#		-Vversion=v$(VERSION) -Vdate=$(DATE) \
#		--lua-filter=scripts/collect-articles.lua \
#		-i demo/empty.md -o $@ --template=demo/landing-template.html

.PHONY: all clean docs
