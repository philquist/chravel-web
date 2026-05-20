import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  DndContext,
  DragOverlay,
  closestCenter,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  rectSortingStrategy,
  verticalListSortingStrategy,
  arrayMove,
} from '@dnd-kit/sortable';
import { SortableCardWrapper } from './SortableCardWrapper';
import { sameIdSequence } from './sameIdSequence';
import { getTouchActivationConstraint } from './touchActivationConstraint';
import { useDashboardCardOrder } from '@/hooks/useDashboardCardOrder';

type DashboardType = 'my_trips' | 'pro' | 'events';

interface SortableTripGridProps<T> {
  items: T[];
  getId: (item: T) => string;
  renderCard: (item: T) => React.ReactNode;
  dashboardType: DashboardType;
  userId: string | undefined;
  reorderMode?: boolean;
  isMobile?: boolean;
  /** Called when user long-presses a card to enter reorder mode (mobile) */
  onLongPressEnterReorder?: () => void;
}

export function SortableTripGrid<T>({
  items,
  getId,
  renderCard,
  dashboardType,
  userId,
  reorderMode = false,
  isMobile = false,
  onLongPressEnterReorder,
}: SortableTripGridProps<T>) {
  const { applyOrder, saveOrder } = useDashboardCardOrder(userId, dashboardType);
  const [orderedItems, setOrderedItems] = useState<T[]>([]);
  const [activeDragItem, setActiveDragItem] = useState<T | null>(null);
  /** Avoid resetting sortable order from props while a drag is in progress (fixes jank / snap-back). */
  const isDraggingRef = useRef(false);
  const orderedItemsRef = useRef<T[]>([]);
  orderedItemsRef.current = orderedItems;

  // Sync from props when not dragging. Stabilize with id-sequence compare to avoid fighting dnd-kit.
  useEffect(() => {
    if (isDraggingRef.current) return;
    setOrderedItems(prev => {
      const next = applyOrder(items, getId);
      if (sameIdSequence(prev, next, getId)) {
        return prev;
      }
      return next;
    });
  }, [items, applyOrder, getId]);

  // Mobile: slightly longer delay helps vertical scroll vs drag; tolerance allows small finger jitter.
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, {
      activationConstraint: getTouchActivationConstraint({ isMobile, reorderMode }),
    }),
  );

  const handleDragStart = useCallback(
    (event: DragStartEvent) => {
      isDraggingRef.current = true;
      if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
        navigator.vibrate(8);
      }
      const id = String(event.active.id);
      const item = orderedItemsRef.current.find(i => getId(i) === id) ?? null;
      setActiveDragItem(item);
    },
    [getId],
  );

  const clearDragUi = useCallback(() => {
    isDraggingRef.current = false;
    setActiveDragItem(null);
  }, []);

  // Defensive: if reorder mode exits via a path that bypasses dnd-kit's drag-end/cancel
  // (tab change, tap-outside, Escape, visibility change), clear any stale drag refs so the
  // sync-from-props effect can resume on next render.
  useEffect(() => {
    if (!reorderMode) clearDragUi();
  }, [reorderMode, clearDragUi]);

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      try {
        if (!over || active.id === over.id) return;

        setOrderedItems(prev => {
          const oldIndex = prev.findIndex(item => getId(item) === active.id);
          const newIndex = prev.findIndex(item => getId(item) === over.id);
          if (oldIndex === -1 || newIndex === -1) return prev;

          const reordered = arrayMove(prev, oldIndex, newIndex);
          saveOrder(reordered.map(getId));
          return reordered;
        });
      } finally {
        clearDragUi();
      }
    },
    [getId, saveOrder, clearDragUi],
  );

  const handleDragCancel = useCallback(() => {
    clearDragUi();
  }, [clearDragUi]);

  const ids = orderedItems.map(getId);
  const strategy = useMemo(
    () => (isMobile ? verticalListSortingStrategy : rectSortingStrategy),
    [isMobile],
  );

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={handleDragCancel}
    >
      <SortableContext items={ids} strategy={strategy}>
        {orderedItems.map(item => (
          <SortableCardWrapper
            key={getId(item)}
            id={getId(item)}
            reorderMode={reorderMode}
            onLongPressEnterReorder={onLongPressEnterReorder}
          >
            {renderCard(item)}
          </SortableCardWrapper>
        ))}
      </SortableContext>
      <DragOverlay dropAnimation={null}>
        {activeDragItem ? (
          <div className="rounded-xl shadow-2xl ring-2 ring-primary/40 ring-offset-2 ring-offset-background scale-[1.02] cursor-grabbing touch-none">
            {renderCard(activeDragItem)}
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
