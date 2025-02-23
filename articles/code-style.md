---
title: My coding style
subtitle: My coding style.
author: Mert Demir
author-url: "https://mertdemir.org"
lang: en
thumbnail: /doc/img/
thumbnail-text: My coding style
thumbnail-css: "outline"
created: 2025-02-22
modified: 2025-02-22
status: published
importance: 4
confidence: likely
css-extension: dropcaps-kanzlei
toc-title: Contents
category: Code
---

## Aim of the project
I'm gonna write about how i made my coding experience more structured less mental breakdown. I hope you find it useful.


## Structure of the project
first structuring the imports. When the projects getting bigger in every file you have to go through them and import them. This is very time consuming and error prone. So I created a `import.py` file. This file is just a collection of imports, and it's used to import the project as a whole.

## Folder Structure

After when you start the project i need to create my folder structure. I already created a boilerplate for all of my projects.

It's a base folder it's not specified about any specific project, but it's a good start. 

In general DS projects i worked, you have to do some type of the jobs in any case, like data collection, creating storage systems, data cleaning, etc. etc.

<br>

So my base folder structure goes like this;


<ul class="tree"><li><p style="margin: 0;"><strong>/dev/projectname</strong></p>

* .venv
* .git
* .github
    * workflows
        * commit.yml
        * main.yml
* config
    * settings.json
    * requirements.txt
    * pyproject.toml
    * config.yaml
* data
* docs
    * API.md
    * FAQ.md
    * index.md
* logs
* models
* reports
* scripts
* src
* templates
* tests
* README.md
* LICENSE
* .gitignore

</li></ul>