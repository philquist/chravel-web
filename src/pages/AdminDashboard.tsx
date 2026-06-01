import React, { useCallback, useState, useEffect } from 'react';
import { unifiedMessagingService } from '@/services/unifiedMessagingService';
import { useProTrips } from '@/hooks/useProTrips';
import type { ScheduledMessage, ScheduledMessagePriority } from '@/types/messaging';
import { Button } from '@/components/ui/button';
import { Plus, X } from 'lucide-react';
import { toast } from 'sonner';
import { useFeatureFlag } from '@/lib/featureFlags';

export const AdminDashboard = () => {
  const [scheduledMessages, setScheduledMessages] = useState<ScheduledMessage[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const proTripsResult = useProTrips();
  const proTrips = (proTripsResult as any).data || proTripsResult.proTrips;
  const isBroadcastSchedulingEnabled = useFeatureFlag('broadcast-scheduling-enabled', false);

  // Modal state
  const [selectedTripId, setSelectedTripId] = useState<string>('');
  const [content, setContent] = useState('');
  const [priority, setPriority] = useState<ScheduledMessagePriority>('fyi');
  const [month, setMonth] = useState((new Date().getMonth() + 1).toString());
  const [day, setDay] = useState(new Date().getDate().toString());
  const [hour, setHour] = useState('12');
  const [minute, setMinute] = useState('00');
  const [ampm, setAmpm] = useState<'AM' | 'PM'>('PM');

  const fetchMessages = useCallback(async () => {
    if (!isBroadcastSchedulingEnabled) {
      setScheduledMessages([]);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    const messages = await unifiedMessagingService.getScheduledMessages();
    setScheduledMessages(messages);
    setIsLoading(false);
  }, [isBroadcastSchedulingEnabled]);

  useEffect(() => {
    fetchMessages();
  }, [fetchMessages]);

  const handleScheduleMessage = async () => {
    if (!isBroadcastSchedulingEnabled) {
      toast.error('Broadcast scheduling is temporarily unavailable');
      return;
    }

    if (!selectedTripId || !content) {
      toast.error('Please select a trip and enter message content');
      return;
    }

    const currentYear = new Date().getFullYear();
    let hours24 = parseInt(hour, 10);
    if (ampm === 'PM' && hours24 < 12) hours24 += 12;
    if (ampm === 'AM' && hours24 === 12) hours24 = 0;

    const scheduledDate = new Date(
      currentYear,
      parseInt(month, 10) - 1,
      parseInt(day, 10),
      hours24,
      parseInt(minute, 10),
    );

    if (scheduledDate <= new Date()) {
      toast.error('Scheduled time must be in the future');
      return;
    }

    const success = await unifiedMessagingService.scheduleMessage(
      selectedTripId,
      content,
      scheduledDate,
      priority,
    );

    if (success) {
      toast.success('Message scheduled successfully');
      setIsModalOpen(false);
      setContent('');
      fetchMessages();
    } else {
      toast.error('Failed to schedule message');
    }
  };

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold mb-6">Admin Dashboard</h1>

      <div className="mb-8 border border-slate-700 rounded-lg p-6 bg-slate-900/50">
        <h2 className="text-xl font-semibold mb-4 text-white">Broadcasts</h2>

        <div className="mb-6 pb-6 border-b border-slate-700">
          <Button
            onClick={() => setIsModalOpen(true)}
            disabled={!isBroadcastSchedulingEnabled}
            className="bg-blue-600 hover:bg-blue-700 flex items-center gap-2"
          >
            <Plus size={16} />
            Schedule Pro Trip Message
          </Button>
          <p className="text-sm text-slate-400 mt-2">
            {isBroadcastSchedulingEnabled
              ? 'Schedule a broadcast to be sent to a Pro Trip at a future date and time.'
              : 'Scheduled messages for Pro Trips are temporarily unavailable while scheduling is disabled.'}
          </p>
        </div>

        <h3 className="text-lg font-medium mb-4">Upcoming Scheduled Messages</h3>
        {isLoading ? (
          <p className="text-slate-400">Loading scheduled messages...</p>
        ) : scheduledMessages.length > 0 ? (
          <ul className="space-y-3">
            {scheduledMessages.map(m => (
              <li key={m.id} className="border border-slate-700 bg-slate-800/50 rounded-md p-4">
                <div className="flex justify-between items-start mb-2">
                  <p className="text-white font-medium">{m.content}</p>
                  <span
                    className={`text-xs px-2 py-1 rounded-full uppercase tracking-wider ${
                      m.priority === 'urgent'
                        ? 'bg-red-900/50 text-red-400 border border-red-800'
                        : m.priority === 'reminder'
                          ? 'bg-amber-900/50 text-amber-400 border border-amber-800'
                          : 'bg-slate-700 text-slate-300'
                    }`}
                  >
                    {m.priority}
                  </span>
                </div>
                <div className="flex justify-between items-center text-sm">
                  <p className="text-blue-400">
                    {new Date(m.sendAt).toLocaleString([], {
                      month: 'short',
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </p>
                  <p className="text-slate-500 font-mono text-xs">
                    Trip: {m.tripId ? `${m.tripId.substring(0, 8)}...` : 'N/A'}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <div className="text-center py-8 text-slate-500 border border-dashed border-slate-700 rounded-md">
            No scheduled messages found.
          </div>
        )}
      </div>

      {/* Schedule Modal */}
      {isModalOpen && isBroadcastSchedulingEnabled && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-50">
          <div className="bg-slate-900 border border-slate-700 rounded-lg p-6 max-w-md w-full relative">
            <button
              onClick={() => setIsModalOpen(false)}
              className="absolute top-4 right-4 text-slate-400 hover:text-white"
            >
              <X size={20} />
            </button>

            <h2 className="text-xl font-bold mb-4">Schedule Message</h2>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">
                  Select Pro Trip
                </label>
                <select
                  className="w-full bg-slate-800 border border-slate-700 rounded-md p-2 text-white"
                  value={selectedTripId}
                  onChange={e => setSelectedTripId(e.target.value)}
                >
                  <option value="">Select a trip...</option>
                  {proTrips?.map(trip => (
                    <option key={trip.id} value={trip.id}>
                      {trip.name || 'Unnamed Trip'}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">
                  Message Content
                </label>
                <textarea
                  className="w-full bg-slate-800 border border-slate-700 rounded-md p-2 text-white min-h-[100px]"
                  value={content}
                  onChange={e => setContent(e.target.value)}
                  placeholder="Enter message..."
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">Priority</label>
                <select
                  className="w-full bg-slate-800 border border-slate-700 rounded-md p-2 text-white"
                  value={priority}
                  onChange={e => setPriority(e.target.value as ScheduledMessagePriority)}
                >
                  <option value="fyi">FYI (Normal)</option>
                  <option value="reminder">Reminder</option>
                  <option value="urgent">Urgent</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  Schedule Time
                </label>
                <div className="flex gap-2 mb-2">
                  <div className="flex-1">
                    <select
                      className="w-full bg-slate-800 border border-slate-700 rounded-md p-2 text-white"
                      value={month}
                      onChange={e => setMonth(e.target.value)}
                    >
                      {Array.from({ length: 12 }).map((_, i) => (
                        <option key={i + 1} value={i + 1}>
                          {new Date(2000, i, 1).toLocaleString('default', { month: 'short' })}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="flex-1">
                    <input
                      type="number"
                      min="1"
                      max="31"
                      className="w-full bg-slate-800 border border-slate-700 rounded-md p-2 text-white"
                      value={day}
                      onChange={e => setDay(e.target.value)}
                      placeholder="Day"
                    />
                  </div>
                </div>

                <div className="flex gap-2">
                  <div className="flex-1">
                    <select
                      className="w-full bg-slate-800 border border-slate-700 rounded-md p-2 text-white"
                      value={hour}
                      onChange={e => setHour(e.target.value)}
                    >
                      {Array.from({ length: 12 }).map((_, i) => (
                        <option key={i + 1} value={i + 1}>
                          {i + 1}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="flex-none flex items-center justify-center text-slate-400 font-bold">
                    :
                  </div>
                  <div className="flex-1">
                    <select
                      className="w-full bg-slate-800 border border-slate-700 rounded-md p-2 text-white"
                      value={minute}
                      onChange={e => setMinute(e.target.value)}
                    >
                      {['00', '15', '30', '45'].map(m => (
                        <option key={m} value={m}>
                          {m}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="flex-1">
                    <select
                      className="w-full bg-slate-800 border border-slate-700 rounded-md p-2 text-white"
                      value={ampm}
                      onChange={e => setAmpm(e.target.value as 'AM' | 'PM')}
                    >
                      <option value="AM">AM</option>
                      <option value="PM">PM</option>
                    </select>
                  </div>
                </div>
              </div>

              <div className="pt-4 flex justify-end gap-3">
                <Button variant="outline" onClick={() => setIsModalOpen(false)}>
                  Cancel
                </Button>
                <Button onClick={handleScheduleMessage} className="bg-blue-600 hover:bg-blue-700">
                  Schedule
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
