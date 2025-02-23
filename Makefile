VERSION=$(shell jq -r .version package.json)
DATE=$(shell date +%F)

MD_FILES := $(wildcard demo/*.md)
HTML_FILES := $(MD_FILES:demo/%.md=%.html)

all: $(HTML_FILES)

clean:
	rm -f *.html

%.html: demo/%.md demo/template.html Makefile
	pandoc --toc -s --css src/reset.css --css src/index.css -Vversion=v$(VERSION) -Vdate=$(DATE) -i $< -o $@ --template=demo/template.html

.PHONY: all clean
