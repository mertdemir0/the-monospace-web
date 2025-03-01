"use client"

import type React from "react"

import { useState, useEffect } from "react"
import Link from "next/link"
import Image from "next/image"
import { Moon, Sun, Search, Settings, HelpCircle, BookOpen, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { PopupProvider, usePopups } from "@/components/popup-manager"

// Create a wrapper component for the content to use hooks
function MainContent() {
  const [isDark, setIsDark] = useState(false)
  const [isReader, setIsReader] = useState(false)
  const [showSearch, setShowSearch] = useState(false)
  const { openPopup } = usePopups()

  // Handle dark mode
  useEffect(() => {
    if (isDark) {
      document.documentElement.classList.add("dark")
    } else {
      document.documentElement.classList.remove("dark")
    }
  }, [isDark])

  const handleLinkClick = (e: React.MouseEvent<HTMLAnchorElement>, title: string, content: string) => {
    e.preventDefault()
    openPopup(
      <div className="prose dark:prose-invert">
        <p>{content}</p>
        <p className="text-sm text-muted-foreground">Source: Wikipedia</p>
      </div>,
      {
        title: title,
        position: { x: e.clientX + 20, y: e.clientY + 20 },
      },
    )
  }

  return (
    <div className={`min-h-screen ${isDark ? "dark" : ""}`}>
      <div className="max-w-[1200px] mx-auto px-4 py-8 dark:bg-zinc-900 dark:text-zinc-100">
        {/* Header */}
        <header className="flex items-start gap-4 mb-12">
          <div className="w-16 h-16">
            <Image
              src="/placeholder.svg?height=64&width=64"
              alt="Logo"
              width={64}
              height={64}
              className="rounded-full"
            />
          </div>
          <nav className="flex-1">
            <div className="flex gap-2 flex-wrap">
              {["ABOUT SITE", "ABOUT ME", "NEW ESSAYS", "NEW LINKS", "PATREON"].map((item) => (
                <Button
                  key={item}
                  variant="outline"
                  className="border rounded px-4 py-2 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                >
                  {item}
                </Button>
              ))}
            </div>
          </nav>
        </header>

        {/* Main Content */}
        <main className="space-y-8">
          {/* Introduction */}
          <div className="prose dark:prose-invert max-w-none">
            <p>
              This is the website of <strong>Your Name</strong>. I write about technology, science, and philosophy. I am
              best known for my writings about artificial intelligence, cognitive science & psychology.
            </p>
            <p className="text-sm">
              For information about my site&apos;s philosophy & method, see the{" "}
              <Link href="#" className="underline decoration-dotted">
                About page
              </Link>
              ; for the website features & implementation, see the{" "}
              <Link href="#" className="underline decoration-dotted">
                Design page
              </Link>
              .
            </p>
          </div>

          {/* Controls */}
          <div className="flex gap-4 text-sm items-center">
            <div className="flex items-center gap-2">
              <span>dark-mode</span>
              <Button variant="ghost" size="sm" onClick={() => setIsDark(!isDark)} className="p-1 h-auto">
                {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
              </Button>
            </div>
            <div className="flex items-center gap-2">
              <span>reader-mode</span>
              <Button variant="ghost" size="sm" onClick={() => setIsReader(!isReader)} className="p-1 h-auto">
                <BookOpen className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {/* Content Grid */}
          <div className="grid md:grid-cols-3 gap-8">
            {/* Newest */}
            <div>
              <h2 className="text-xl font-serif border-b border-dotted pb-1 mb-4">NEWEST</h2>
              <ul className="space-y-2">
                {[
                  {
                    title: "Neural Networks Explained",
                    content:
                      "A neural network is a network or circuit of biological neurons, or, in a modern sense, an artificial neural network, composed of artificial neurons or nodes. Thus, a neural network is either a biological neural network, made up of biological neurons, or an artificial neural network, for solving artificial intelligence (AI) problems.",
                  },
                  {
                    title: "The History of AI",
                    content:
                      "The history of artificial intelligence began in antiquity, with myths, stories and rumors of artificial beings endowed with intelligence or consciousness by master craftsmen. The seeds of modern AI were planted by philosophers who attempted to describe the process of human thinking as the mechanical manipulation of symbols.",
                  },
                  {
                    title: "Machine Learning Basics",
                    content:
                      "Machine learning is a field of inquiry devoted to understanding and building methods that 'learn', that is, methods that leverage data to improve performance on some set of tasks. It is seen as a part of artificial intelligence.",
                  },
                ].map((item) => (
                  <li key={item.title} className="flex items-start gap-2">
                    <span className="text-zinc-400">•</span>
                    <a
                      href="#"
                      onClick={(e) => handleLinkClick(e, item.title, item.content)}
                      className="underline decoration-dotted hover:text-zinc-600 dark:hover:text-zinc-300"
                    >
                      {item.title}
                    </a>
                  </li>
                ))}
              </ul>
            </div>

            {/* Popular */}
            <div>
              <h2 className="text-xl font-serif border-b border-dotted pb-1 mb-4">POPULAR</h2>
              <ul className="space-y-2">
                {[
                  {
                    title: "Cognitive Science Overview",
                    content:
                      "Cognitive science is the interdisciplinary, scientific study of the mind and its processes. It examines the nature, the tasks, and the functions of cognition. Cognitive scientists study intelligence and behavior, with a focus on how nervous systems represent, process, and transform information.",
                  },
                  {
                    title: "Psychology of Learning",
                    content:
                      "Learning is the process of acquiring new understanding, knowledge, behaviors, skills, values, attitudes, and preferences. The ability to learn is possessed by humans, animals, and some machines; there is also evidence for some kind of learning in certain plants.",
                  },
                  {
                    title: "Statistical Methods",
                    content:
                      "Statistical methods are mathematical formulas, models, and techniques that are used in statistical analysis of raw research data. The application of statistical methods extracts information from research data and provides different ways to assess the robustness of research outputs.",
                  },
                ].map((item) => (
                  <li key={item.title} className="flex items-start gap-2">
                    <span className="text-zinc-400">◆</span>
                    <a
                      href="#"
                      onClick={(e) => handleLinkClick(e, item.title, item.content)}
                      className="underline decoration-dotted hover:text-zinc-600 dark:hover:text-zinc-300"
                    >
                      {item.title}
                    </a>
                  </li>
                ))}
              </ul>
            </div>

            {/* Notable */}
            <div>
              <h2 className="text-xl font-serif border-b border-dotted pb-1 mb-4">NOTABLE</h2>
              <ul className="space-y-2">
                {[
                  {
                    title: "Consciousness Studies",
                    content:
                      "Consciousness is the state or quality of awareness or of being aware of an external object or something within oneself. It has been defined as: sentience, awareness, subjectivity, the ability to experience or to feel, wakefulness, having a sense of selfhood, and the executive control system of the mind.",
                  },
                  {
                    title: "Evolution of AI",
                    content:
                      "The evolution of artificial intelligence has been marked by key developments in computing, algorithms, and our understanding of intelligence itself. From early rule-based systems to modern deep learning networks, AI has grown increasingly sophisticated in its ability to perform complex tasks.",
                  },
                  {
                    title: "Human-AI Interaction",
                    content:
                      "Human–AI interaction is the study of interactions between humans and artificial intelligence. It draws from and informs several fields, including human–computer interaction, artificial intelligence, robotics, natural language processing, and social sciences.",
                  },
                ].map((item) => (
                  <li key={item.title} className="flex items-start gap-2">
                    <span className="text-zinc-400">◆</span>
                    <a
                      href="#"
                      onClick={(e) => handleLinkClick(e, item.title, item.content)}
                      className="underline decoration-dotted hover:text-zinc-600 dark:hover:text-zinc-300"
                    >
                      {item.title}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </main>

        {/* Floating Controls */}
        <div className="fixed right-4 top-1/2 -translate-y-1/2 flex flex-col gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowSearch(!showSearch)}
            className="p-1 h-auto bg-white dark:bg-zinc-800 shadow-sm"
          >
            <Search className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="sm" className="p-1 h-auto bg-white dark:bg-zinc-800 shadow-sm">
            <Settings className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="sm" className="p-1 h-auto bg-white dark:bg-zinc-800 shadow-sm">
            <HelpCircle className="h-4 w-4" />
          </Button>
        </div>

        {/* Search Modal */}
        {showSearch && (
          <div className="fixed inset-0 bg-black/50 flex items-start justify-center pt-20">
            <div className="bg-white dark:bg-zinc-900 p-4 rounded-lg shadow-lg w-full max-w-2xl">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-lg font-medium">Search</h2>
                <Button variant="ghost" size="sm" onClick={() => setShowSearch(false)} className="p-1 h-auto">
                  <X className="h-4 w-4" />
                </Button>
              </div>
              <input
                type="search"
                placeholder="Search articles..."
                className="w-full px-4 py-2 border rounded dark:bg-zinc-800 dark:border-zinc-700"
                autoFocus
              />
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// Wrap the MainContent with PopupProvider
export default function Home() {
  return (
    <PopupProvider>
      <MainContent />
    </PopupProvider>
  )
}

