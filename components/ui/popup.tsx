"use client"

import type React from "react"

import { useEffect, useRef, useState } from "react"
import { X, Minimize2, Maximize2, Pin, PinOff } from "lucide-react"
import { Button } from "@/components/ui/button"

interface PopupProps {
  children: React.ReactNode
  title?: string
  onClose?: () => void
  defaultPosition?: { x: number; y: number }
  isOpen?: boolean
}

export function Popup({ children, title, onClose, defaultPosition, isOpen = true }: PopupProps) {
  const [position, setPosition] = useState(defaultPosition || { x: 100, y: 100 })
  const [isDragging, setIsDragging] = useState(false)
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 })
  const [isPinned, setIsPinned] = useState(false)
  const [isMinimized, setIsMinimized] = useState(false)
  const [isCollapsed, setIsCollapsed] = useState(false)
  const popupRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !isPinned) {
        onClose?.()
      }
    }

    window.addEventListener("keyup", handleKeyUp)
    return () => window.removeEventListener("keyup", handleKeyUp)
  }, [isPinned, onClose])

  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      setIsDragging(true)
      setDragStart({
        x: e.clientX - position.x,
        y: e.clientY - position.y,
      })
    }
  }

  const handleMouseMoveRef = useRef((e: MouseEvent) => {
    if (!isDragging) return

    const newX = e.clientX - dragStart.x
    const newY = e.clientY - dragStart.y

    // Clamp to viewport bounds
    const popup = popupRef.current
    if (!popup) return

    const rect = popup.getBoundingClientRect()
    const maxX = window.innerWidth - rect.width
    const maxY = window.innerHeight - rect.height

    setPosition({
      x: Math.min(Math.max(0, newX), maxX),
      y: Math.min(Math.max(0, newY), maxY),
    })
  })

  const handleMouseUpRef = useRef(() => {
    setIsDragging(false)
  })

  useEffect(() => {
    const handleMouseMove = handleMouseMoveRef.current
    const handleMouseUp = handleMouseUpRef.current

    if (isDragging) {
      window.addEventListener("mousemove", handleMouseMove)
      window.addEventListener("mouseup", handleMouseUp)
    }
    return () => {
      window.removeEventListener("mousemove", handleMouseMove)
      window.removeEventListener("mouseup", handleMouseUp)
    }
  }, [isDragging])

  if (!isOpen) return null

  return (
    <div
      ref={popupRef}
      className={`fixed z-50 min-w-[200px] max-w-[600px] rounded-lg border bg-background shadow-lg ${
        isMinimized ? "h-[40px] overflow-hidden" : ""
      }`}
      style={{
        left: position.x,
        top: position.y,
        position: isPinned ? "fixed" : "absolute",
      }}
    >
      {/* Title Bar */}
      <div
        className="flex h-10 items-center justify-between border-b px-4 cursor-move"
        onMouseDown={handleMouseDown}
        onDoubleClick={() => setIsCollapsed(!isCollapsed)}
      >
        <div className="text-sm font-medium">{title}</div>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setIsPinned(!isPinned)}>
            {isPinned ? <PinOff className="h-4 w-4" /> : <Pin className="h-4 w-4" />}
          </Button>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setIsMinimized(!isMinimized)}>
            {isMinimized ? <Maximize2 className="h-4 w-4" /> : <Minimize2 className="h-4 w-4" />}
          </Button>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Content */}
      <div className={`p-4 ${isCollapsed ? "hidden" : ""}`}>{children}</div>
    </div>
  )
}

