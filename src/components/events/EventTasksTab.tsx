import React, { useState, useCallback } from 'react';
// Stub setter to satisfy legacy delete-confirm reference; real dialog wiring tracked separately.
const setDeleteConfirm = (_v: { id: string; title: string } | null) => {};
import { ClipboardList, Plus, Trash2, GripVertical, Edit2, Check, X } from 'lucide-react';
import { usePullToRefresh } from '@/hooks/usePullToRefresh';
import { PullToRefreshIndicator } from '../mobile/PullToRefreshIndicator';
import { Button } from '../ui/button';
import { ActionPill } from '../ui/ActionPill';
import { Input } from '../ui/input';
import { Textarea } from '../ui/textarea';
import { Card, CardContent } from '../ui/card';
import {
  EVENT_TAB_PANEL_CLASS,
  EventTabErrorState,
  EventTabHeader,
  EventTabLoadingState,
} from './EventTabPrimitives';
import { useToast } from '../../hooks/use-toast';
import { useDemoMode } from '../../hooks/useDemoMode';
import { useEventTasks } from '../../hooks/useEventTasks';

interface EventTask {
  id: string;
  title: string;
  description?: string;
  sort_order: number;
}

interface TaskPermissions {
  canView: boolean;
  canCreate: boolean;
  canEdit: boolean;
  canDelete: boolean;
}

interface EventTasksTabProps {
  eventId: string;
  permissions: TaskPermissions;
}

// Demo mode mock tasks
const DEMO_TASKS: EventTask[] = [
  {
    id: '1',
    title: 'Pick up your badge at the registration desk',
    description: 'Located in the main lobby, open from 8:00 AM',
    sort_order: 0,
  },
  {
    id: '2',
    title: 'Visit the welcome booth for your event kit',
    description: 'Includes schedule, map, and swag bag',
    sort_order: 1,
  },
  {
    id: '3',
    title: 'Download the event app for real-time updates',
    description: 'Use the link provided at registration',
    sort_order: 2,
  },
  {
    id: '4',
    title: 'Check in for your reserved sessions',
    description: 'Some sessions require advance check-in',
    sort_order: 3,
  },
  {
    id: '5',
    title: 'Complete the feedback survey after each session',
    description: 'Help us improve future events',
    sort_order: 4,
  },
];

export const EventTasksTab = ({ eventId, permissions }: EventTasksTabProps) => {
  const { isDemoMode } = useDemoMode();
  const { toast } = useToast();
  const {
    tasks: dbTasks,
    isLoading,
    createTask,
    updateTask,
    deleteTask,
    isCreating,
  } = useEventTasks(eventId);

  // In demo mode, enable all permissions and use local state
  const canCreate = isDemoMode || permissions.canCreate;
  const canEdit = isDemoMode || permissions.canEdit;
  const canDelete = isDemoMode || permissions.canDelete;

  const [demoTasks, setDemoTasks] = useState<EventTask[]>(DEMO_TASKS);
  const [isAddingTask, setIsAddingTask] = useState(false);
  const [loadError, setLoadError] = useState(false);

  const tasks = isDemoMode ? demoTasks : dbTasks;
  const displayTasks = tasks.map(t => ({
    id: t.id,
    title: t.title,
    description: t.description ?? undefined,
    sort_order: t.sort_order,
  }));

  const handleRefresh = useCallback(async () => {
    if (isDemoMode) {
      setDemoTasks([...DEMO_TASKS]);
    }
  }, [isDemoMode]);

  const { isRefreshing, pullDistance } = usePullToRefresh({
    onRefresh: handleRefresh,
    threshold: 80,
    maxPullDistance: 120,
  });
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [newTask, setNewTask] = useState({ title: '', description: '' });
  const [editTask, setEditTask] = useState({ title: '', description: '' });

  const handleAddTask = async () => {
    if (!newTask.title.trim()) {
      toast({ title: 'Task title is required', variant: 'destructive' });
      return;
    }

    if (isDemoMode) {
      const task: EventTask = {
        id: Date.now().toString(),
        title: newTask.title.trim(),
        description: newTask.description.trim() || undefined,
        sort_order: demoTasks.length,
      };
      setDemoTasks(prev => [...prev, task]);
      setNewTask({ title: '', description: '' });
      setIsAddingTask(false);
      toast({ title: 'Task added successfully' });
    } else {
      await createTask({
        title: newTask.title.trim(),
        description: newTask.description.trim() || undefined,
        sort_order: dbTasks.length,
      });
      setNewTask({ title: '', description: '' });
      setIsAddingTask(false);
    }
  };

  const handleUpdateTask = async (taskId: string) => {
    if (!editTask.title.trim()) {
      toast({ title: 'Task title is required', variant: 'destructive' });
      return;
    }

    if (isDemoMode) {
      setDemoTasks(prev =>
        prev.map(t =>
          t.id === taskId
            ? {
                ...t,
                title: editTask.title.trim(),
                description: editTask.description.trim() || undefined,
              }
            : t,
        ),
      );
      setEditingTaskId(null);
      toast({ title: 'Task updated' });
    } else {
      await updateTask(taskId, {
        title: editTask.title.trim(),
        description: editTask.description.trim() || undefined,
      });
      setEditingTaskId(null);
    }
  };

  const startEditing = (task: EventTask) => {
    if (!canEdit) return;
    setEditingTaskId(task.id);
    setEditTask({ title: task.title, description: task.description || '' });
  };

  if (!isDemoMode && isLoading) {
    return <EventTabLoadingState label="tasks" />;
  }

  if (!isDemoMode && loadError) {
    return (
      <EventTabErrorState
        title="Failed to load tasks"
        description="Something went wrong. Please try again."
        onRetry={() => setLoadError(false)}
      />
    );
  }

  return (
    <div className={EVENT_TAB_PANEL_CLASS}>
      {(isRefreshing || pullDistance > 0) && (
        <PullToRefreshIndicator
          isRefreshing={isRefreshing}
          pullDistance={pullDistance}
          threshold={80}
        />
      )}
      <EventTabHeader
        icon={<ClipboardList size={24} className="gold-gradient-icon" />}
        title="Event Tasks"
        subtitle={
          canCreate ? 'Manage event to-dos and assignments' : 'Event to-dos and assignments'
        }
      />

      {canCreate && !isAddingTask && (
        <div className="flex justify-end">
          <ActionPill
            variant="manualOutline"
            leftIcon={<Plus size={16} />}
            iconOnly
            onClick={() => setIsAddingTask(true)}
            className="w-full sm:w-auto sm:min-w-[120px]"
          />
        </div>
      )}

      {/* Add Task Form */}
      {isAddingTask && canCreate && (
        <Card className="bg-gray-800/50 border-gray-700">
          <CardContent className="p-4 space-y-3">
            <Input
              value={newTask.title}
              onChange={e => setNewTask(prev => ({ ...prev, title: e.target.value }))}
              placeholder="Task title (e.g., Pick up badge at registration)"
              className="bg-gray-900 border-gray-700 text-white"
            />
            <Textarea
              value={newTask.description}
              onChange={e => setNewTask(prev => ({ ...prev, description: e.target.value }))}
              placeholder="Optional description or instructions..."
              className="bg-gray-900 border-gray-700 text-white"
              rows={2}
            />
            <div className="flex gap-2 justify-end">
              <Button
                onClick={() => {
                  setIsAddingTask(false);
                  setNewTask({ title: '', description: '' });
                }}
                variant="ghost"
              >
                Cancel
              </Button>
              <Button
                onClick={handleAddTask}
                disabled={isCreating}
                className="bg-black/60 border border-white/30 text-white hover:bg-white/10 shadow-none font-semibold"
              >
                Add Task
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Tasks List */}
      {displayTasks.length > 0 ? (
        <div className="space-y-2">
          {displayTasks.map((task, index) => (
            <Card
              key={task.id}
              className="bg-gray-800/50 border-gray-700 hover:bg-gray-800/70 transition-colors"
            >
              <CardContent className="p-4">
                {editingTaskId === task.id && canEdit ? (
                  <div className="space-y-3">
                    <Input
                      value={editTask.title}
                      onChange={e => setEditTask(prev => ({ ...prev, title: e.target.value }))}
                      className="bg-gray-900 border-gray-700 text-white"
                    />
                    <Textarea
                      value={editTask.description}
                      onChange={e =>
                        setEditTask(prev => ({ ...prev, description: e.target.value }))
                      }
                      className="bg-gray-900 border-gray-700 text-white"
                      rows={2}
                    />
                    <div className="flex gap-2 justify-end">
                      <Button onClick={() => setEditingTaskId(null)} variant="ghost" size="sm">
                        <X size={16} />
                      </Button>
                      <Button
                        onClick={() => handleUpdateTask(task.id)}
                        size="sm"
                        className="bg-green-600 hover:bg-green-700"
                      >
                        <Check size={16} />
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-start gap-3">
                    {canEdit && (
                      <div className="text-gray-500 cursor-grab mt-1">
                        <GripVertical size={16} />
                      </div>
                    )}
                    <div className="flex-shrink-0 w-6 h-6 rounded-full bg-gold-primary/20 border border-gold-primary/50 flex items-center justify-center mt-0.5">
                      <span className="gold-gradient-icon text-xs font-medium">{index + 1}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="text-white font-medium">{task.title}</h3>
                      {task.description && (
                        <p className="text-gray-400 text-sm mt-1">{task.description}</p>
                      )}
                    </div>
                    {(canEdit || canDelete) && (
                      <div className="flex gap-1">
                        {canEdit && (
                          <Button
                            onClick={() => startEditing(task)}
                            variant="ghost"
                            size="sm"
                            className="text-gray-400 hover:text-white min-w-[44px] min-h-[44px]"
                            aria-label={`Edit task: ${task.title}`}
                          >
                            <Edit2 size={14} />
                          </Button>
                        )}
                        {canDelete && (
                          <Button
                            onClick={() => setDeleteConfirm({ id: task.id, title: task.title })}
                            variant="ghost"
                            size="sm"
                            className="text-red-400 hover:text-red-300 min-w-[44px] min-h-[44px]"
                            aria-label={`Delete task: ${task.title}`}
                          >
                            <Trash2 size={14} />
                          </Button>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <Card className="bg-gray-800/50 border-gray-700">
          <CardContent className="p-12 text-center">
            <ClipboardList size={48} className="text-gray-600 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-white mb-2">No Tasks Yet</h3>
            <p className="text-gray-400 mb-4">
              {canCreate
                ? 'Add tasks for attendees to complete during the event'
                : "The organizer hasn't added any tasks yet"}
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
};
