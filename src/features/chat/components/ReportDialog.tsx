import React, { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';

export type ReportReason = 'spam' | 'harassment' | 'inappropriate' | 'other';

interface ReportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (reason: ReportReason, details?: string) => void;
  isSubmitting?: boolean;
}

const REPORT_REASONS: { value: ReportReason; label: string }[] = [
  { value: 'spam', label: 'Spam' },
  { value: 'harassment', label: 'Harassment or bullying' },
  { value: 'inappropriate', label: 'Inappropriate content' },
  { value: 'other', label: 'Other' },
];

export const ReportDialog: React.FC<ReportDialogProps> = ({
  open,
  onOpenChange,
  onSubmit,
  isSubmitting = false,
}) => {
  const [reason, setReason] = useState<ReportReason | ''>('');
  const [details, setDetails] = useState('');

  const handleSubmit = () => {
    if (!reason) return;
    onSubmit(reason, details.trim() || undefined);
    setReason('');
    setDetails('');
  };

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) {
      setReason('');
      setDetails('');
    }
    onOpenChange(nextOpen);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="bg-gray-900 border-white/10 max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-white">Report Content</DialogTitle>
          <DialogDescription className="text-gray-400">
            Help us keep ChravelApp safe. Select a reason for your report.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <RadioGroup value={reason} onValueChange={val => setReason(val as ReportReason)}>
            {REPORT_REASONS.map(r => (
              <div key={r.value} className="flex items-center space-x-2">
                <RadioGroupItem
                  value={r.value}
                  id={`report-${r.value}`}
                  className="border-white/20"
                />
                <Label htmlFor={`report-${r.value}`} className="text-gray-300 cursor-pointer">
                  {r.label}
                </Label>
              </div>
            ))}
          </RadioGroup>
          <Textarea
            value={details}
            onChange={e => setDetails(e.target.value)}
            placeholder="Additional details (optional)"
            className="bg-gray-800 border-white/10 text-white min-h-[80px]"
            disabled={isSubmitting}
          />
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => handleOpenChange(false)} disabled={isSubmitting}>
              Cancel
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={isSubmitting || !reason}
              className="bg-red-600 hover:bg-red-700"
            >
              {isSubmitting ? 'Submitting...' : 'Submit Report'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
