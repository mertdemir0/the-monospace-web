"use client"

import type React from "react"

import { createContext, useContext, useState } from "react"
import { Popup } from "@/components/ui/popup"

interface PopupContextType {
  openPopup: (content: React.ReactNode, options?: PopupOptions) => void
  closePopup: (id: string) => void
}

interface PopupOptions {
  id?: string
  title?: string
  position?: { x: number; y: number }
}

interface PopupInstance {
  id: string
  content: React.ReactNode
  title?: string
  position?: { x: number; y: number }
}

const PopupContext = createContext<PopupContextType | null>(null)

export function PopupProvider({ children }: { children: React.ReactNode }) {
  const [popups, setPopups] = useState<PopupInstance[]>([])

  const openPopup = (content: React.ReactNode, options: PopupOptions = {}) => {
    const id = options.id || Math.random().toString(36).substr(2, 9)
    setPopups((prev) => [...prev, { id, content, ...options }])
  }

  const closePopup = (id: string) => {
    setPopups((prev) => prev.filter((popup) => popup.id !== id))
  }

  return (
    <PopupContext.Provider value={{ openPopup, closePopup }}>
      {children}
      {popups.map((popup) => (
        <Popup key={popup.id} title={popup.title} defaultPosition={popup.position} onClose={() => closePopup(popup.id)}>
          {popup.content}
        </Popup>
      ))}
    </PopupContext.Provider>
  )
}

export function usePopups() {
  const context = useContext(PopupContext)
  if (!context) {
    throw new Error("usePopups must be used within a PopupProvider")
  }
  return context
}

