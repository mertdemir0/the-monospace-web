/***************************************************************************/
/*  The target-testing and pop-frame-filling functions in this section
	come in sets, which define and implement classes of pop-frames
	(whether those be popups, or popins, etc.). (These classes are things
	like “a link that has a statically generated extract provided for it”,
	“a link to a locally archived web page”, “an anchorlink to a section of
	the current page”, and so on.)

	Each set contains a testing function, which is called by
	testTarget() to determine if the target (link, etc.) is eligible for
	processing, and is also called by fillPopFrame() to find the
	appropriate filling function for a pop-frame spawned by a given
	target. The testing function takes a target element and examines its
	href or other properties, and returns true if the target is a member of
	that class of targets, false otherwise.

	NOTE: These testing (a.k.a. “type predicate”) functions SHOULD NOT be used
	directly, but only via Extracts.targetTypeInfo()!

	Each set also contains the corresponding filling function, which
	is called by fillPopFrame() (chosen on the basis of the return values
	of the testing functions, and the specified order in which they’re
	called). The filling function takes a target element and returns a
	DocumentFragment whose contents should be injected into the pop-frame
	spawned by the given target.
 */

Extracts.targetTypeDefinitions.insertBefore([
	"LOCAL_PAGE",          // Type name
	"isLocalPageLink",     // Type predicate function
	"has-content",         // Target classes to add
	"localPageForTarget",  // Pop-frame fill function
	"local-page"           // Pop-frame classes
], (def => def[0] == "ANNOTATION_PARTIAL"));

/*=-------------=*/
/*= LOCAL PAGES =*/
/*=-------------=*/

Extracts = { ...Extracts,
    /*  Local links (to sections of the current page, or other site pages).
     */
    //  Called by: Extracts.targetTypeInfo (as `predicateFunctionName`)
    isLocalPageLink: (target) => {
        return (   Content.contentTypes.localPage.matches(target)
				&& (   isAnchorLink(target)
					|| target.pathname != location.pathname));
    },

    /*  TOC links.
     */
    //  Called by: Extracts.testTarget_LOCAL_PAGE
    //  Called by: Extracts.preparePopup_LOCAL_PAGE
    isTOCLink: (target) => {
        return (target.closest("#TOC") != null);
    },

    /*  Links in the sidebar.
     */
    //  Called by: Extracts.testTarget_LOCAL_PAGE
    isSidebarLink: (target) => {
        return (target.closest("#sidebar") != null);
    },

	/*	“Full context” links in backlinks lists.
	 */
	isFullBacklinkContextLink: (target) => {
		return (   target.closest(".backlink-source") != null
				&& target.classList.contains("link-page")
				&& Annotations.isAnnotatedLink(target) == false);
	},

	/*	Annotation title-links on mobile.
	 */
	isMobileAnnotationTitleLink: (target) => {
		return (   GW.isMobile()
				&& target.matches(".data-field.title a.title-link"));
	},

    /*  This “special testing function” is used to exclude certain targets which
        have already been categorized as (in this case) `LOCAL_PAGE` targets. It
        returns false if the target is to be excluded, true otherwise. Excluded
        targets will not spawn pop-frames.
     */
    //  Called by: Extracts.targets.testTarget (as `testTarget_${targetTypeInfo.typeName}`)
    testTarget_LOCAL_PAGE: (target) => {
        return (!(   Extracts.popFrameProvider == Popins
        		  && (   Extracts.isTOCLink(target)
        			  || Extracts.isSidebarLink(target)
        			  || Extracts.isMobileAnnotationTitleLink(target))));
    },

    //  Called by: Extracts.fillPopFrame (as `popFrameFillFunctionName`)
    //	Called by: Extracts.citationForTarget (extracts-content.js)
    //	Called by: Extracts.citationBackLinkForTarget (extracts-content.js)
    localPageForTarget: (target) => {
        GWLog("Extracts.localPageForTarget", "extracts-content.js", 2);

		/*  If the target is an anchor-link, check to see if the target location
			matches an already-displayed page (which can be the root page of the
			window).

			If the entire linked page is already displayed, and if the
			target points to an anchor in that page, display the linked
			section or element.

			Also display just the linked block if we’re spawning this
			pop-frame from a table of contents.

			Otherwise, display the entire linked page.
		 */
		let fullPage = !(   isAnchorLink(target)
        				 && (   target.closest(".TOC")
        					 || Extracts.targetDocument(target)));

		//	Synthesize include-link (with or without hash, as appropriate).
		let includeLink = synthesizeIncludeLink(target, {
			class: "include-strict include-block-context-expanded include-spinner-not"
		});

		//  Mark full-page embed pop-frames.
        if (fullPage)
			Extracts.addPopFrameClassesToLink(includeLink, "full-page");

		//	Designate “full context” pop-frames for backlinks.
		if (Extracts.isFullBacklinkContextLink(target))
			Extracts.addPopFrameClassesToLink(includeLink, "full-backlink-context");

		if (fullPage) {
			stripAnchorsFromLink(includeLink);
		} else if (   Extracts.isFullBacklinkContextLink(target)
				   && target.pathname == location.pathname) {
			/*	Since “full” context is just the base page, which we don’t want
				to pop up/in, we instead show the containing section or
				footnote.
			 */
			let targetElement = targetElementInDocument(target, Extracts.rootDocument);
			let nearestSection = targetElement.closest("section, li.footnote");
			if (nearestSection)
				includeLink.hash = "#" + nearestSection.id;
		}

		return newDocument(includeLink);
    },

    //  Called by: Extracts.titleForPopFrame (as `titleForPopFrame_${targetTypeName}`)
    titleForPopFrame_LOCAL_PAGE: (popFrame) => {
        GWLog("Extracts.titleForPopFrame_LOCAL_PAGE", "extracts-content.js", 2);

        let target = popFrame.spawningTarget;
        let referenceData = Content.referenceDataForLink(target);

		let popFrameTitleHTML;
		if (referenceData == null) {
			let popFrameTitleText = "";
			if (target.pathname != location.pathname)
				popFrameTitleText += target.pathname;
			if (popFrame.classList.contains("full-page") == false)
				popFrameTitleText += target.hash;
			popFrameTitleHTML = `<code>${popFrameTitleText}</code>`;
		} else {
			let popFrameTitleTextParts = [ ];
			if (target.pathname != location.pathname)
				popFrameTitleTextParts.push(referenceData.pageTitle);
			if (popFrame.classList.contains("full-page") == false) {
                //  Find the target element and/or containing block, if any.
                let element = targetElementInDocument(target, referenceData.content);

                //  Section title or block id.
                if (element) {
                    let nearestSection = element.closest("section");
                    let nearestFootnote = element.closest("li.footnote");
                    if (nearestFootnote) {
                        popFrameTitleTextParts.push("Footnote", Notes.noteNumber(nearestFootnote));
                        let identifyingSpan = nearestFootnote.querySelector("span[id]:empty");
                        if (identifyingSpan)
                            popFrameTitleTextParts.push(`(#${(identifyingSpan.id)})`);
                    } else if (nearestSection) {
                        //  Section mark (§) for sections.
                        popFrameTitleTextParts.push("&#x00a7;");
                        if (nearestSection.id == "footnotes") {
                            popFrameTitleTextParts.push("Footnotes");
                        } else {
                            popFrameTitleTextParts.push(nearestSection.firstElementChild.textContent);
                        }
                    } else {
                        popFrameTitleTextParts.push(target.hash);
                    }
                }
			}
			popFrameTitleHTML = popFrameTitleTextParts.join(" ");
		}

		/*	This is for section backlinks popups for the base page, and any
			(section or full) backlinks popups for a different page.
		 */
		if (   popFrame.classList.contains("backlinks")
			&& (   target.pathname == location.pathname
				&& [ "#backlinks", "#backlinks-section" ].includes(target.hash)) == false)
			popFrameTitleHTML += " (Backlinks)";

		return Transclude.fillTemplateNamed("pop-frame-title-standard", {
			popFrameTitleLinkHref:  target.href,
			popFrameTitle:          popFrameTitleHTML
		});
    },

	//	Called by: Extracts.preparePopup_LOCAL_PAGE
	preparePopFrame_LOCAL_PAGE: (popFrame) => {
        GWLog("Extracts.preparePopFrame_LOCAL_PAGE", "extracts-content.js", 2);

        let target = popFrame.spawningTarget;

		/*	For local content embed pop-frames, add handler to trigger
			transcludes in source content when they trigger in the pop-frame.
		 */
		if (Content.cachedDataExists(target)) {
			GW.notificationCenter.addHandlerForEvent("GW.contentDidInject", popFrame.updateSourceContentOnTranscludeTriggerHandler = (info) => {
				Content.updateCachedContent(target, (content) => {
					Transclude.allIncludeLinksInContainer(content).filter(includeLink =>
						includeLink.href == info.includeLink.href
					).forEach(includeLink => {
						Transclude.transclude(includeLink, true);
					});

					return true;
				});
			}, { condition: (info) => (   info.source == "transclude"
									   && info.document == popFrame.document) });
			//	Add handler to remove the above handler when pop-frame despawns.
			let suffix = Extracts.popFrameTypeSuffix();
			GW.notificationCenter.addHandlerForEvent(`Pop${suffix}s.pop${suffix}WillDespawn`, (info) => {
				GW.notificationCenter.removeHandlerForEvent("GW.contentDidInject", popFrame.updateSourceContentOnTranscludeTriggerHandler);
			}, {
				once: true,
				condition: (info) => (info[`pop${suffix}`] == popFrame)
			});
		}

		return popFrame;
	},

    //  Called by: Extracts.preparePopFrame (as `preparePop${suffix}_${targetTypeName}`)
    preparePopup_LOCAL_PAGE: (popup) => {
        GWLog("Extracts.preparePopup_LOCAL_PAGE", "extracts-content.js", 2);

        let target = popup.spawningTarget;

		//  Do not spawn “full context” popup if the link is visible.
 		if (   Extracts.isFullBacklinkContextLink(target)
 			&& popup.classList.contains("full-page") == false
 			&& Popups.isVisible(targetElementInDocument(target, Extracts.rootDocument)))
			return null;

		/*  Designate popups spawned from section links in the the TOC (for
            special styling).
         */
        if (Extracts.isTOCLink(target))
        	Extracts.popFrameProvider.addClassesToPopFrame(popup, "toc-section");

        return Extracts.preparePopFrame_LOCAL_PAGE(popup);
    },

	//	Called by: Extracts.rewritePopFrameContent (as `updatePopFrame_${targetTypeName}`)
	updatePopFrame_LOCAL_PAGE: (popFrame) => {
        GWLog("Extracts.updatePopFrame_LOCAL_PAGE", "extracts-content.js", 2);

		//	Add page body classes.
		let referenceData = Content.referenceDataForLink(popFrame.spawningTarget);
		Extracts.popFrameProvider.addClassesToPopFrame(popFrame, ...(referenceData.pageBodyClasses.filter(c => c.startsWith("dropcaps-") == false)));

		//	Update pop-frame title.
		Extracts.updatePopFrameTitle(popFrame);
	},

    //  Called by: Extracts.rewritePopinContent_LOCAL_PAGE
    //  Called by: Extracts.rewritePopupContent_LOCAL_PAGE
    rewritePopFrameContent_LOCAL_PAGE: (popFrame, contentContainer) => {
        GWLog("Extracts.rewritePopFrameContent_LOCAL_PAGE", "extracts-content.js", 2);

		//	Something failed somehow (probably a transclude error).
		if (isNodeEmpty(contentContainer)) {
			Extracts.postRefreshUpdatePopFrame(popFrame, false);
			return;
		}

		//	Remove empty page-metadata section.
		let pageMetadata = contentContainer.querySelector("#page-metadata");
		if (isNodeEmpty(pageMetadata))
			pageMetadata.remove();

		//	Make first image load eagerly.
		let firstImage = (   contentContainer.querySelector(".page-thumbnail")
						  ?? contentContainer.querySelector("figure img"))
		if (firstImage) {
			firstImage.loading = "eager";
			firstImage.decoding = "sync";
		}

		//	Expand a single collapse block encompassing the top level content.
		if (   isOnlyChild(contentContainer.firstElementChild)
			&& contentContainer.firstElementChild.classList.contains("collapse"))
			expandLockCollapseBlock(contentContainer.firstElementChild);

		/*	In the case where the spawning link points to a specific element
			within the transcluded content, but we’re transcluding the full
			page and not just the block context of the targeted element,
			transclude.js has not marked the targeted element for us already.
			So we must do it here.
		 */
		let target = popFrame.spawningTarget;
		if (   isAnchorLink(target)
			&& popFrame.classList.containsAnyOf([ "full-page", "full-backlink-context" ]))
			highlightTargetElementInDocument(target, popFrame.document);

		//  Scroll to the target.
		Extracts.scrollToTargetedElementInPopFrame(popFrame);
    },

    //  Called by: Extracts.rewritePopFrameContent (as `rewritePop${suffix}Content_${targetTypeName}`)
    rewritePopupContent_LOCAL_PAGE: (popup, contentContainer) => {
        GWLog("Extracts.rewritePopupContent_LOCAL_PAGE", "extracts-content.js", 2);

        //  Make anchorlinks scroll popup instead of opening normally.
		Extracts.constrainLinkClickBehaviorInPopFrame(popup);

		//	Non-provider-specific rewrites.
		Extracts.rewritePopFrameContent_LOCAL_PAGE(popup, contentContainer);
    },

    //  Called by: Extracts.rewritePopFrameContent (as `rewritePop${suffix}Content_${targetTypeName}`)
    rewritePopinContent_LOCAL_PAGE: (popin, contentContainer) => {
        GWLog("Extracts.rewritePopinContent_LOCAL_PAGE", "extracts-content.js", 2);

        /*  Make anchorlinks scroll popin instead of opening normally
        	(but only for non-popin-spawning anchorlinks).
         */
		Extracts.constrainLinkClickBehaviorInPopFrame(popin, (link => link.classList.contains("spawns-popin") == false));

		//	Non-provider-specific rewrites.
		Extracts.rewritePopFrameContent_LOCAL_PAGE(popin, contentContainer);
    }
};

/*=-----------------=*/
/*= AUXILIARY LINKS =*/
/*=-----------------=*/

Extracts.targetTypeDefinitions.insertBefore([
    "AUX_LINKS",            // Type name
    "isAuxLinksLink",       // Type predicate function
    "has-content",          // Target classes to add
    "auxLinksForTarget",    // Pop-frame fill function
    "aux-links"             // Pop-frame classes
], (def => def[0] == "LOCAL_PAGE"));

Extracts = { ...Extracts,
    //  Called by: extracts.js (as `predicateFunctionName`)
    isAuxLinksLink: (target) => {
        let auxLinksLinkType = AuxLinks.auxLinksLinkType(target);
        return (   auxLinksLinkType != null
                && target.classList.contains(auxLinksLinkType));
    },

    /*  This “special testing function” is used to exclude certain targets which
        have already been categorized as (in this case) `AUX_LINKS` targets.
        It returns false if the target is to be excluded, true otherwise.
        Excluded targets will not spawn pop-frames.
     */
    //  Called by: Extracts.targets.testTarget (as `testTarget_${targetTypeInfo.typeName}`)
    testTarget_AUX_LINKS: (target) => {
        let exclude = false;
        let auxLinksType = AuxLinks.auxLinksLinkType(target);
        let containingAnnotation = target.closest(".annotation");
        if (containingAnnotation) {
            let includedAuxLinksBlock = containingAnnotation.querySelector(`.${auxLinksType}-append`);
            if (includedAuxLinksBlock)
                exclude = true;
        }

        return (!(   Extracts.popFrameProvider == Popins
                  && exclude == true));
    },

    /*  Backlinks, similar-links, etc.
     */
    //  Called by: extracts.js (as `popFrameFillFunctionName`)
    auxLinksForTarget: (target) => {
        GWLog("Extracts.auxLinksForTarget", "extracts-content.js", 2);

		return newDocument(synthesizeIncludeLink(target, {
			class: "include-strict include-spinner-not " + AuxLinks.auxLinksLinkType(target)
		}));
    },

    //  Called by: extracts.js (as `titleForPopFrame_${targetTypeName}`)
    titleForPopFrame_AUX_LINKS: (popFrame) => {
        let target = popFrame.spawningTarget;
        let targetPage = AuxLinks.targetOfAuxLinksLink(target);
        let auxLinksLinkType = AuxLinks.auxLinksLinkType(target);
        switch (auxLinksLinkType) {
		case "backlinks":
			return newDocument(`<code>${targetPage}</code><span> (Backlinks)</span>`);
		case "similars":
			return newDocument(`<code>${targetPage}</code><span> (Similar links)</span>`);
		case "link-bibliography":
			return newDocument(`<code>${targetPage}</code><span> (Bibliography)</span>`);
		default:
			return newDocument(`<code>${targetPage}</code>`);
        }
    },

    //  Called by: Extracts.preparePopFrame (as `preparePopFrame_${targetTypeName}`)
    preparePopFrame_AUX_LINKS: (popFrame) => {
        GWLog("Extracts.preparePopFrame_AUX_LINKS", "extracts-content.js", 2);

        let auxLinksLinkType = AuxLinks.auxLinksLinkType(popFrame.spawningTarget);
        if (auxLinksLinkType > "")
            Extracts.popFrameProvider.addClassesToPopFrame(popFrame, auxLinksLinkType);

        return popFrame;
    },

    //  Called by: extracts.js (as `rewritePopFrameContent_${targetTypeName}`)
    rewritePopFrameContent_AUX_LINKS: (popFrame, contentContainer) => {
        GWLog("Extracts.rewritePopFrameContent_AUX_LINKS", "extracts-content.js", 2);

		if (Extracts.popFrameProvider == Popups) {
			popFrame.document.querySelectorAll(".backlink-source a:nth-of-type(2)").forEach(fullContextLink => {
				let targetDocument = Extracts.targetDocument(fullContextLink);
				if (targetDocument) {
					let targetElement = targetElementInDocument(fullContextLink, targetDocument);
					fullContextLink.addEventListener("mouseenter", (event) => {
						targetElement.classList.toggle("block-context-highlighted-temp", true);
					});
					fullContextLink.addEventListener("mouseleave", (event) => {
						targetElement.classList.toggle("block-context-highlighted-temp", false);
					});
					GW.notificationCenter.addHandlerForEvent("Popups.popupWillDespawn", (info) => {
						targetElement.classList.toggle("block-context-highlighted-temp", false);
					}, {
						once: true,
						condition: (info) => (info.popup == popFrame)
					});
				}
			});
		}
    }
};

/*=--------------------=*/
/*= DROPCAP INFO LINKS =*/
/*=--------------------=*/

Extracts.targetTypeDefinitions.insertBefore([
    "DROPCAP_INFO",          // Type name
    "isDropcapInfoLink",     // Type predicate function
    null,                    // Target classes to add
    "dropcapInfoForTarget",  // Pop-frame fill function
    (popFrame) => [          // Pop-frame classes
		"dropcap-info",
		(Extracts.popFrameProvider == Popups
		 ? "mini-title-bar"
		 : "no-footer-bar")
	].join(" ")
], (def => def[0] == "LOCAL_PAGE"));

Extracts = { ...Extracts,
    //  Called by: extracts.js (as `predicateFunctionName`)
    isDropcapInfoLink: (target) => {
        return Content.contentTypes.dropcapInfo.matches(target);
    },

    //  Called by: extracts.js (as `popFrameFillFunctionName`)
    dropcapInfoForTarget: (target) => {
        GWLog("Extracts.dropcapInfoForTarget", "extracts-content.js", 2);

		return newDocument(synthesizeIncludeLink(target, {
			"class": "include-strict",
			"data-letter": target.dataset.letter,
			"data-dropcap-type": target.dataset.dropcapType
		}));
    },

    //  Called by: extracts.js (as `preparePopFrame_${targetTypeName}`)
	preparePopFrame_DROPCAP_INFO: (popFrame) => {
		//	Base location is base location of spawning link’s document.
		popFrame.document.baseLocation = baseLocationForDocument(popFrame.spawningTarget.getRootNode());

		return popFrame;
	},
};

/*=-----------=*/
/*= FOOTNOTES =*/
/*=-----------=*/

Extracts.targetTypeDefinitions.insertBefore([
    "FOOTNOTE",           // Type name
    "isFootnoteLink",     // Type predicate function
    null,                 // Target classes to add
    "footnoteForTarget",  // Pop-frame fill function
    (popFrame) => [       // Pop-frame classes
		"footnote",
		(Extracts.popFrameProvider == Popups
		 ? "mini-title-bar"
		 : "no-footer-bar")
	].join(" ")
], (def => def[0] == "LOCAL_PAGE"));

Extracts = { ...Extracts,
    //  Called by: extracts.js (as `predicateFunctionName`)
    isFootnoteLink: (target) => {
        return target.classList.contains("footnote-ref");
    },

    //  Called by: extracts.js (as `popFrameFillFunctionName`)
    footnoteForTarget: (target) => {
        GWLog("Extracts.footnoteForTarget", "extracts-content.js", 2);

		let includeLink = synthesizeIncludeLink(target, {
			"class": "include-strict include-spinner-not",
			"data-include-selector-not": ".footnote-self-link, .footnote-back"
		})
		includeLink.hash = "#" + Notes.footnoteIdForNumber(Notes.noteNumber(target));
		return newDocument(includeLink);
    },

    //  Called by: extracts.js (as `titleForPopFrame_${targetTypeName}`)
    titleForPopFrame_FOOTNOTE: (popFrame) => {
        let target = popFrame.spawningTarget;
        let footnoteNumber = target.querySelector("sup").textContent;
        let popFrameTitleHTML = `Footnote #${footnoteNumber}`;

        return Extracts.standardPopFrameTitleElementForTarget(target, popFrameTitleHTML);
    },

    //  Called by: extracts.js (as `preparePopup_${targetTypeName}`)
    preparePopup_FOOTNOTE: (popup) => {
        let target = popup.spawningTarget;

        /*  Do not spawn footnote popup if the {side|foot}note it points to is
            visible.
         */
        if (Array.from(Notes.allNotesForCitation(target)).findIndex(note => Popups.isVisible(note)) !== -1)
            return null;

        /*  Add event listeners to highlight citation when its footnote
            popup is hovered over.
         */
        popup.addEventListener("mouseenter", (event) => {
            target.classList.toggle("highlighted", true);
        });
        popup.addEventListener("mouseleave", (event) => {
            target.classList.toggle("highlighted", false);
        });
        GW.notificationCenter.addHandlerForEvent("Popups.popupWillDespawn", (info) => {
            target.classList.toggle("highlighted", false);
        }, {
			once: true,
			condition: (info) => (info.popup == popup)
		});

        return popup;
    }
};

/*=-------------------------=*/
/*= CITATIONS CONTEXT LINKS =*/
/*=-------------------------=*/

Extracts.targetTypeDefinitions.insertBefore([
    "CITATION_CONTEXT",           // Type name
    "isCitationContextLink",      // Type predicate function
    null,                         // Target classes to add
    "citationContextForTarget",   // Pop-frame fill function
    (popFrame) => [               // Pop-frame classes
		"citation-context",
		(Extracts.popFrameProvider == Popups
		 ? "mini-title-bar"
		 : "no-footer-bar")
	].join(" ")
], (def => def[0] == "LOCAL_PAGE"));

Extracts = { ...Extracts,
    //  Called by: extracts.js (as `predicateFunctionName`)
    isCitationContextLink: (target) => {
        return target.classList.contains("footnote-back");
    },

    //  Called by: extracts.js (as `popFrameFillFunctionName`)
    citationContextForTarget: (target) => {
        GWLog("Extracts.citationContextForTarget", "extracts-content.js", 2);

        return newDocument(synthesizeIncludeLink(target, {
        	class: "include-block-context-expanded include-strict include-spinner-not"
        }));
    },

    /*  This “special testing function” is used to exclude certain targets which
        have already been categorized as (in this case) `CITATION_CONTEXT`
        targets. It returns false if the target is to be excluded, true
        otherwise. Excluded targets will not spawn pop-frames.
     */
    //  Called by: extracts.js (as `testTarget_${targetTypeInfo.typeName}`)
    testTarget_CITATION_CONTEXT: (target) => {
        return (Extracts.popFrameProvider != Popins);
    },

    //  Called by: extracts.js (as `preparePopup_${targetTypeName}`)
    preparePopup_CITATION_CONTEXT: (popup) => {
        let target = popup.spawningTarget;

        //  Do not spawn citation context popup if citation is visible.
        let targetDocument = Extracts.targetDocument(target);
        if (targetDocument) {
        	let targetElement = targetElementInDocument(target, targetDocument);
        	if (   targetElement
        		&& Popups.isVisible(targetElement))
        		return null;
        }

        return popup;
    },

    //  Called by: extracts.js (as `rewritePopupContent_${targetTypeName}`)
    rewritePopupContent_CITATION_CONTEXT: (popup, contentContainer) => {
        GWLog("Extracts.rewritePopupContent_CITATION_CONTEXT", "extracts-content.js", 2);

        //  Highlight citation in popup.
        /*  Remove the .targeted class from a targeted citation (if any)
            inside the popup (to prevent confusion with the citation that
            the spawning link points to, which will be highlighted).
         */
        popup.document.querySelectorAll(".footnote-ref.targeted").forEach(targetedCitation => {
            targetedCitation.classList.remove("targeted");
        });
        //  In the popup, the citation for which context is being shown.
        let citationInPopup = targetElementInDocument(popup.spawningTarget, popup.document);
        //  Highlight the citation.
        citationInPopup.classList.add("targeted");
        //	Remove class that would interfere with styling.
        citationInPopup.classList.remove("block-context-highlighted");

        //  Scroll to the citation.
        Extracts.scrollToTargetedElementInPopFrame(popup);
    }
};

/*=---------------=*/
/*= REMOTE IMAGES =*/
/*=---------------=*/

Extracts.targetTypeDefinitions.insertBefore([
	"REMOTE_IMAGE",          // Type name
	"isRemoteImageLink",     // Type predicate function
	"has-content",           // Target classes to add
	"remoteImageForTarget",  // Pop-frame fill function
	"image object"           // Pop-frame classes
], (def => def[0] == "LOCAL_PAGE"));

Extracts = { ...Extracts,
    //  Called by: extracts.js (as `predicateFunctionName`)
    isRemoteImageLink: (target) => {
        return Content.contentTypes.remoteImage.matches(target);
    },

    //  Called by: extracts.js (as `popFrameFillFunctionName`)
    remoteImageForTarget: (target) => {
        GWLog("Extracts.remoteImageForTarget", "extracts-content.js", 2);

		return newDocument(synthesizeIncludeLink(target, {
			"class": "include-caption-not include-strict include-spinner-not"
        }));
    },

    //  Called by: Extracts.rewritePopFrameContent (as `rewritePop${suffix}Content_${targetTypeName}`)
    rewritePopupContent_REMOTE_IMAGE: (popup, contentContainer) => {
        GWLog("Extracts.rewritePopFrameContent_REMOTE_IMAGE", "extracts-content.js", 2);

		contentContainer.querySelector("img").addEventListener("load", (event) => {
			requestAnimationFrame(() => {
				Extracts.resizeObjectInObjectPopup(popup, "img");
			});
		}, { once: true });
    }
};

/*=---------------=*/
/*= REMOTE VIDEOS =*/
/*=---------------=*/

Extracts.targetTypeDefinitions.insertBefore([
    "REMOTE_VIDEO",          // Type name
    "isRemoteVideoLink",     // Type predicate function
    "has-content",           // Target classes to add
    "remoteVideoForTarget",  // Pop-frame fill function
    "video object"           // Pop-frame classes
], (def => def[0] == "LOCAL_PAGE"));

Extracts = { ...Extracts,
    //  Called by: extracts.js (as `predicateFunctionName`)
    isRemoteVideoLink: (target) => {
        return Content.contentTypes.remoteVideo.matches(target);
    },

    //  Called by: extracts.js (as `popFrameFillFunctionName`)
    remoteVideoForTarget: (target) => {
        GWLog("Extracts.remoteVideoForTarget", "extracts-content.js", 2);

		return newDocument(synthesizeIncludeLink(target, {
			class: "include-strict include-spinner-not"
		}));
    },

    //  Called by: extracts.js (as `preparePopup_${targetTypeName}`)
    preparePopup_REMOTE_VIDEO: (popup) => {
		let target = popup.spawningTarget;

		if (Content.contentTypes.remoteVideo.isYoutubeLink(target)) {
			Extracts.popFrameProvider.addClassesToPopFrame(popup, "youtube");
		} else if (Content.contentTypes.remoteVideo.isVimeoLink(target)) {
			Extracts.popFrameProvider.addClassesToPopFrame(popup, "vimeo");
		}

        return popup;
    }
};

/*=--------------------=*/
/*= CONTENT TRANSFORMS =*/
/*=--------------------=*/

Extracts.targetTypeDefinitions.insertBefore([
    "CONTENT_TRANSFORM",              // Type name
    "isContentTransformLink",         // Type predicate function
	/*	NOTE: At some point, `content-transform` (or some analogous class) will
		be added by the back-end code (or content.js for links in popups), so
		will be removed from the line below.
			—SA 2024-04-15
	 */
    "has-annotation content-transform",  // Target classes to add
    "contentTransformForTarget",      // Pop-frame fill function
    "content-transform"               // Pop-frame classes
], (def => def[0] == "LOCAL_PAGE"));

Extracts = { ...Extracts,
    //  Called by: extracts.js (as `predicateFunctionName`)
	isContentTransformLink: (target) => {
		return (   target.classList.contains("content-transform-not") == false
				&& [ "tweet",
					 "wikipediaEntry",
					 "githubIssue"
					 ].findIndex(x => Content.contentTypes[x].matches(target)) !== -1);
	},

    //  Called by: extracts.js (as `popFrameFillFunctionName`)
	contentTransformForTarget: (target) => {
        GWLog("Extracts.contenTransformForTarget", "extracts-content.js", 2);

        return newDocument(synthesizeIncludeLink(target, {
			"class": "include-strict include-spinner-not",
			"data-include-template": "$popFrameTemplate"
        }));
	},

    //  Called by: extracts.js (as `preparePopup_${targetTypeName}`)
    preparePopup_CONTENT_TRANSFORM: (popup) => {
        /*  Do not spawn popup if the transformed content is already visible
            on screen. (This may occur if the target is in a popup that was
            spawned from a backlinks popup for this same content as viewed on
            a tag index page, for example.)
         */
        let escapedLinkURL = CSS.escape(decodeURIComponent(popup.spawningTarget.href));
        let targetAnalogueInLinkBibliography = document.querySelector(`a[id^='link-bibliography'][href='${escapedLinkURL}']`);
        if (targetAnalogueInLinkBibliography) {
            let containingSection = targetAnalogueInLinkBibliography.closest("section");
            if (   containingSection
                && containingSection.querySelector("blockquote")
                && Popups.isVisible(containingSection)) {
                return null;
            }
        }

        return popup;
    },

	//	Called by: Extracts.rewritePopFrameContent (as `updatePopFrame_${targetTypeName}`)
	updatePopFrame_CONTENT_TRANSFORM: (popFrame) => {
        GWLog("Extracts.updatePopFrame_CONTENT_TRANSFORM", "extracts-content.js", 2);

		let referenceData = Content.referenceDataForLink(popFrame.spawningTarget);

        //  Mark pop-frame with content type class.
		Extracts.popFrameProvider.addClassesToPopFrame(popFrame, ...(referenceData.contentTypeClass.split(" ")));

		//	Make anchor-links in Wikipedia content transforms un-clickable.
		if (referenceData.contentTypeClass == "wikipedia-entry")
			Extracts.constrainLinkClickBehaviorInPopFrame(popFrame);

        //  Update pop-frame title.
        Extracts.updatePopFrameTitle(popFrame, referenceData.popFrameTitle);
	}
};

/*=-----------------------=*/
/*= LOCALLY HOSTED VIDEOS =*/
/*=-----------------------=*/

Extracts.targetTypeDefinitions.insertBefore([
    "LOCAL_VIDEO",          // Type name
    "isLocalVideoLink",     // Type predicate function
    "has-content",          // Target classes to add
    "localVideoForTarget",  // Pop-frame fill function
    (popFrame) => [         // Pop-frame classes
		"video object",
		(Extracts.popFrameProvider == Popups
		 ? "mini-title-bar"
		 : "no-footer-bar")
	].join(" ")
], (def => def[0] == "LOCAL_PAGE"));

Extracts = { ...Extracts,
    //  Called by: extracts.js (as `predicateFunctionName`)
    isLocalVideoLink: (target) => {
        return Content.contentTypes.localVideo.matches(target);
    },

    //  Called by: extracts.js (as `popFrameFillFunctionName`)
    localVideoForTarget: (target) => {
        GWLog("Extracts.localVideoForTarget", "extracts-content.js", 2);

        return newDocument(synthesizeIncludeLink(target, {
			"class": "include-caption-not include-strict include-spinner-not"
        }));
    },

    //  Called by: Extracts.rewritePopFrameContent (as `rewritePop${suffix}Content_${targetTypeName}`)
    rewritePopupContent_LOCAL_VIDEO: (popup, contentContainer) => {
        GWLog("Extracts.rewritePopFrameContent_LOCAL_VIDEO", "extracts-content.js", 2);

		Extracts.resizeObjectInObjectPopup(popup, "video", { loosenSizeConstraints: true });
    }
};

/*=----------------------------=*/
/*= LOCALLY HOSTED AUDIO FILES =*/
/*=----------------------------=*/

Extracts.targetTypeDefinitions.insertBefore([
    "LOCAL_AUDIO",          // Type name
    "isLocalAudioLink",     // Type predicate function
    "has-content",          // Target classes to add
    "localAudioForTarget",  // Pop-frame fill function
    (popFrame) => [         // Pop-frame classes
		"audio object",
		(Extracts.popFrameProvider == Popups
		 ? "mini-title-bar no-resize-height"
		 : "no-footer-bar")
	].join(" ")
], (def => def[0] == "LOCAL_PAGE"));

Extracts = { ...Extracts,
    //  Called by: extracts.js (as `predicateFunctionName`)
    isLocalAudioLink: (target) => {
        return Content.contentTypes.localAudio.matches(target);
    },

    //  Called by: extracts.js (as `popFrameFillFunctionName`)
    localAudioForTarget: (target) => {
        GWLog("Extracts.localAudioForTarget", "extracts-content.js", 2);

        return newDocument(synthesizeIncludeLink(target, {
			"class": "include-caption-not include-strict include-spinner-not"
        }));
    }
};

/*=-----------------------=*/
/*= LOCALLY HOSTED IMAGES =*/
/*=-----------------------=*/

Extracts.targetTypeDefinitions.insertBefore([
    "LOCAL_IMAGE",          // Type name
    "isLocalImageLink",     // Type predicate function
    "has-content",          // Target classes to add
    "localImageForTarget",  // Pop-frame fill function
    (popFrame) => [         // Pop-frame classes
		"image object",
		(Extracts.popFrameProvider == Popups
		 ? "mini-title-bar"
		 : "no-footer-bar")
	].join(" ")
], (def => def[0] == "LOCAL_PAGE"));

Extracts = { ...Extracts,
    //  Called by: extracts.js (as `predicateFunctionName`)
    isLocalImageLink: (target) => {
        return Content.contentTypes.localImage.matches(target);
    },

    //  Called by: extracts.js (as `popFrameFillFunctionName`)
    localImageForTarget: (target) => {
        GWLog("Extracts.localImageForTarget", "extracts-content.js", 2);

        return newDocument(synthesizeIncludeLink(target, {
			"class": "include-caption-not include-strict include-spinner-not"
        }));
    },

    //  Called by: extracts.js (as `rewritePopFrameContent_${targetTypeName}`)
    rewritePopFrameContent_LOCAL_IMAGE: (popFrame, contentContainer) => {
        GWLog("Extracts.rewritePopFrameContent_LOCAL_IMAGE", "extracts-content.js", 2);

		//	Mark sized image pop-frame.
        if (popFrame.document.querySelector("img[width][height]"))
        	Extracts.popFrameProvider.addClassesToPopFrame(popFrame, "dimensions-specified");
    },

    //  Called by: Extracts.rewritePopFrameContent (as `rewritePop${suffix}Content_${targetTypeName}`)
    rewritePopupContent_LOCAL_IMAGE: (popup, contentContainer) => {
        GWLog("Extracts.rewritePopFrameContent_LOCAL_IMAGE", "extracts-content.js", 2);

		Extracts.resizeObjectInObjectPopup(popup, "img", { loosenSizeConstraints: true });

		//	Non-provider-specific rewrites.
		Extracts.rewritePopFrameContent_LOCAL_IMAGE(popup, contentContainer);
    }
};

/*=--------------------------=*/
/*= LOCALLY HOSTED DOCUMENTS =*/
/*=--------------------------=*/

Extracts.targetTypeDefinitions.insertBefore([
    "LOCAL_DOCUMENT",               // Type name
    "isLocalDocumentLink",          // Type predicate function
    "has-content",                  // Target classes to add
    "localDocumentForTarget",       // Pop-frame fill function
    "local-document object"         // Pop-frame classes
], (def => def[0] == "LOCAL_PAGE"));

Extracts = { ...Extracts,
    //  Called by: extracts.js (as `predicateFunctionName`)
    isLocalDocumentLink: (target) => {
    	return Content.contentTypes.localDocument.matches(target);
    },

    //  Called by: extracts.js (as `popFrameFillFunctionName`)
    localDocumentForTarget: (target) => {
        GWLog("Extracts.localDocumentForTarget", "extracts-content.js", 2);

        return newDocument(synthesizeIncludeLink(target, {
        	class: "include-strict include-spinner-not"
        }));
    },

    /*  This “special testing function” is used to exclude certain targets which
        have already been categorized as (in this case) `LOCAL_DOCUMENT`
        targets. It returns false if the target is to be excluded, true
        otherwise. Excluded targets will not spawn pop-frames.
     */
    //  Called by: extracts.js (as `testTarget_${targetTypeInfo.typeName}`)
    testTarget_LOCAL_DOCUMENT: (target) => {
    	/*	Mobile browsers have no in-browser PDF viewer, so a popin would be
    		pointless, since the file will download anyway.
    	 */
    	if (   Extracts.popFrameProvider == Popins
            && target.pathname.endsWith(".pdf"))
            return false;

        return true;
    },

    //  Called by: extracts.js (as `rewritePopFrameContent_${targetTypeName}`)
    rewritePopFrameContent_LOCAL_DOCUMENT: (popFrame, contentContainer) => {
        GWLog("Extracts.rewritePopFrameContent_LOCAL_DOCUMENT", "extracts-content.js", 2);

		let iframe = popFrame.document.querySelector("iframe");
		if (iframe) {
			iframe.addEventListener("load", (event) => {
				//  Set title of popup from page title, if any.
				let title = iframe.contentDocument.title?.trim();
				if (title > "")
					Extracts.updatePopFrameTitle(popFrame, title);
			}, { once: true });
		}
    }
};

/*=---------------------------=*/
/*= LOCALLY HOSTED CODE FILES =*/
/*=---------------------------=*/

Extracts.targetTypeDefinitions.insertBefore([
    "LOCAL_CODE_FILE",              // Type name
    "isLocalCodeFileLink",          // Type predicate function
    "has-content",                  // Target classes to add
    "localCodeFileForTarget",       // Pop-frame fill function
    "local-code-file"               // Pop-frame classes
], (def => def[0] == "LOCAL_PAGE"));

Extracts = { ...Extracts,
    //  Called by: extracts.js (as `predicateFunctionName`)
    isLocalCodeFileLink: (target) => {
    	return Content.contentTypes.localCodeFile.matches(target);
    },

    //  Called by: extracts.js (as `popFrameFillFunctionName`)
    localCodeFileForTarget: (target) => {
        GWLog("Extracts.localCodeFileForTarget", "extracts-content.js", 2);

        return newDocument(synthesizeIncludeLink(target, {
        	class: "include-strict include-spinner-not"
        }));
    }
};

/*=----------------=*/
/*= OTHER WEBSITES =*/
/*=----------------=*/

Extracts.targetTypeDefinitions.insertBefore([
    "FOREIGN_SITE",             // Type name
    "isForeignSiteLink",        // Type predicate function
    "has-content",              // Target classes to add
    "foreignSiteForTarget",     // Pop-frame fill function
    "foreign-site object"       // Pop-frame classes
], (def => def[0] == "LOCAL_PAGE"));

Extracts = { ...Extracts,
    //  Called by: extracts.js (as `predicateFunctionName`)
    isForeignSiteLink: (target) => {
        return Content.contentTypes.foreignSite.matches(target);
    },

    //  Called by: extracts.js (as `popFrameFillFunctionName`)
    foreignSiteForTarget: (target) => {
        GWLog("Extracts.foreignSiteForTarget", "extracts-content.js", 2);

        return newDocument(synthesizeIncludeLink(target, {
        	class: "include-strict include-spinner-not"
        }));
    }
};

/*=------------------=*/
/*= CONTENT: HELPERS =*/
/*=------------------=*/

Extracts = { ...Extracts,
	/*	Called by: Extracts.rewritePopupContent_LOCAL_IMAGE
	 */
	resizeObjectInObjectPopup: (popup, objectSelector, options) => {
		options = Object.assign({
			width: null,
			height: null,
			loosenSizeConstraints: false
		}, options);

		let object = popup.document.querySelector(objectSelector);
		if (object == null)
			return;

		let specifiedWidth = options.width ?? parseInt(object.getAttribute("width") ?? "0");
		let specifiedHeight = options.height ?? parseInt(object.getAttribute("height") ?? "0");

		let computedStyles = getComputedStyle(document.documentElement);
		let popupMaxWidth = parseInt(computedStyles.getPropertyValue("--GW-popups-popup-max-width"));
		let popupMaxHeight = parseInt(computedStyles.getPropertyValue("--GW-popups-popup-max-height"));
		let popupBorderWidth = parseInt(computedStyles.getPropertyValue("--GW-popups-popup-border-width"));
		let popupTitleBarHeight = popup.classList.contains("mini-title-bar") ? 21 : 31;
		let popupHorizontalPadding = popupBorderWidth * 2;
		let popupVerticalPadding = popupBorderWidth * 2 + popupTitleBarHeight;

		/*	Allow media popups to squeeze the same maximum screen area (defined
			by the --GW-popups-popup-max-width and --GW-popups-popup-max-height
			CSS variables) into more horizontal or vertical space (useful for 
			images that deviate from the standard ~4:3 aspect ratio of popups).
		 */
		if (options.loosenSizeConstraints) {
			let popupWidth = specifiedWidth + popupHorizontalPadding;
			let popupHeight = specifiedHeight + popupVerticalPadding;
			let popupMaxArea = popupMaxWidth * popupMaxHeight;
			popupMaxWidth = Math.sqrt(popupMaxArea / (popupHeight / popupWidth));
			popupMaxHeight = popupMaxWidth * (popupHeight / popupWidth);
			if (popupMaxHeight > window.innerHeight) {
				popupMaxWidth *= window.innerHeight / popupMaxHeight;
				popupMaxHeight = window.innerHeight;
			} else if (popupMaxWidth > window.innerWidth) {
				popupMaxHeight *= window.innerWidth / popupMaxWidth;
				popupMaxWidth = window.innerWidth;
			}
		}

		let objectMaxWidth = popupMaxWidth - popupHorizontalPadding;
		let objectMaxHeight = popupMaxHeight - popupVerticalPadding;

		let height = Math.round(Math.min(Math.min(specifiedWidth, objectMaxWidth) * (specifiedHeight / specifiedWidth), objectMaxHeight));
		let width = Math.round(height * (specifiedWidth / specifiedHeight));

		object.style.width = `${width}px`;
		object.style.height = `${height}px`;

		object.style.setProperty("--aspect-ratio", object.style.aspectRatio);

		if (options.loosenSizeConstraints) {
			popup.style.maxWidth = "unset";
			popup.style.maxHeight = "unset";
		}
	},

	//	Used in: Extracts.setUpContentLoadEventsWithin
	contentLoadHoverDelay: 25,

    //  Called by: extracts.js
    setUpContentLoadEventsWithin: (container) => {
        GWLog("Extracts.setUpContentLoadEventsWithin", "extracts-content.js", 2);

        /*  Get all targets in the container that use Content as a data loading
        	provider. (Currently that is local page links, local fragment links,
        	and local code file links.)
         */
        let allTargetsInContainer = Array.from(container.querySelectorAll("a[class*='has-content'], a[class*='content-transform']")).filter(link =>
        	Content.contentTypeForLink(link) != null
        );

        if (Extracts.popFrameProvider == Popups) {
            //  Add hover event listeners to all the chosen targets.
            allTargetsInContainer.forEach(target => {
                target.removeContentLoadEvents = onEventAfterDelayDo(target, "mouseenter", Extracts.contentLoadHoverDelay, (event) => {
                    //  Do nothing if the content is already loaded.
                    if (Content.cachedDataExists(target) == false)
                        Content.load(target);
                }, {
                	cancelOnEvents: [ "mouseleave" ]
                });
            });

			if (allTargetsInContainer.length > 0) {
				/*  Set up handler to remove hover event listeners from all
					the chosen targets in the document.
					*/
				GW.notificationCenter.addHandlerForEvent("Extracts.cleanupDidComplete", (info) => {
					allTargetsInContainer.forEach(target => {
						if (target.removeContentLoadEvents) {
							target.removeContentLoadEvents();
							target.removeContentLoadEvents = null;
						}
					});
				}, { once: true });
            }
        } else { // if (Extracts.popFrameProvider == Popins)
            //  Add click event listeners to all the chosen targets.
            allTargetsInContainer.forEach(target => {
                target.addEventListener("click", target.contentLoad_click = (event) => {
                    //  Do nothing if the content is already loaded.
                    if (Content.cachedDataExists(target) == false)
                        Content.load(target);
                });
            });

            /*  Set up handler to remove click event listeners from all
                the annotated targets in the document.
                */
            GW.notificationCenter.addHandlerForEvent("Extracts.cleanupDidComplete", (info) => {
                allTargetsInContainer.forEach(target => {
                    target.removeEventListener("click", target.contentLoad_click);
                });
            }, { once: true });
        }
    },
};
