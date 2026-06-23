import React, { useState, useRef, useEffect } from 'react';
import { User, Upload, Phone, LogOut, Trash2 } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { useDemoMode } from '../../hooks/useDemoMode';
import { supabase } from '../../integrations/supabase/client';
import { useToast } from '../../hooks/use-toast';
import { getConsistentAvatar } from '../../utils/avatarUtils';
import { useNavigate } from 'react-router-dom';
import { DeleteAccountDialog } from './DeleteAccountDialog';

export const ConsumerProfileSection = () => {
  const { user, updateProfile, signOut } = useAuth();
  const { isDemoMode: _isDemoMode, showDemoContent } = useDemoMode();
  const { toast } = useToast();
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Local state for form fields
  const [realName, setRealName] = useState(user?.realName || '');
  const [displayName, setDisplayName] = useState(user?.displayName || '');
  const [phone, setPhone] = useState(user?.phone || '');
  const [isSaving, setIsSaving] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);

  // Initialize state when user loads
  useEffect(() => {
    if (user) {
      setRealName(user.realName || '');
      setDisplayName(user.displayName || '');
      setPhone(user.phone || '');
    }
  }, [user]);

  // Create mock user for demo mode when no real user is authenticated
  const mockUser = {
    id: 'demo-user-123',
    email: 'demo@example.com',
    displayName: 'Demo User',
    realName: undefined as string | undefined,
    namePreference: 'display' as const,
    avatar: getConsistentAvatar('Demo User'),
  };

  const currentUser = user || mockUser;

  const handleSave = async () => {
    // In demo mode, just show success without making API calls
    if (showDemoContent) {
      toast({
        title: 'Profile updated',
        description: 'Your profile changes have been saved successfully.',
      });
      return;
    }

    if (!user) return;

    // Validate display name length
    if (displayName.trim().length > 50) {
      toast({
        title: 'Validation error',
        description: 'Display name must be 50 characters or less.',
        variant: 'destructive',
      });
      return;
    }

    // Validate real name length
    if (realName.trim().length > 100) {
      toast({
        title: 'Validation error',
        description: 'Real name must be 100 characters or less.',
        variant: 'destructive',
      });
      return;
    }

    setIsSaving(true);
    try {
      // Canonical identity lives in `profiles` (via useAuth.updateProfile upsert).
      const { error } = await updateProfile({
        real_name: realName.trim() || null,
        display_name: displayName.trim() || null,
        phone: phone || null,
      });

      if (error) throw error;

      toast({
        title: 'Profile updated',
        description: 'Your profile changes have been saved successfully.',
      });
    } catch (error) {
      if (import.meta.env.DEV) console.error('Error saving profile:', error);
      const message = (error as { message?: string })?.message?.includes(
        'Display name can only be changed twice',
      )
        ? 'Display name can only be changed twice every 30 days. Please try again later.'
        : 'Failed to save profile changes. Please try again.';
      toast({
        title: 'Error',
        description: message,
        variant: 'destructive',
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // In demo mode, just show success without uploading
    if (showDemoContent) {
      toast({
        title: 'Photo uploaded',
        description: 'Your profile photo has been updated.',
      });
      // Reset file input
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
      return;
    }

    if (!user) return;

    // Validate file type
    if (!file.type.startsWith('image/')) {
      toast({
        title: 'Invalid file type',
        description: 'Please upload an image file (JPG, PNG, GIF).',
        variant: 'destructive',
      });
      return;
    }

    // Validate file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      toast({
        title: 'File too large',
        description: 'Image size must be less than 5MB.',
        variant: 'destructive',
      });
      return;
    }

    setIsUploading(true);
    try {
      const fileExt = file.name.includes('.')
        ? file.name.split('.').pop()
        : file.type.split('/')[1] || 'jpg';
      // Path must start with user.id for RLS policies to work correctly
      const filePath = `${user.id}/${Date.now()}.${fileExt}`;

      // Upload to Supabase Storage with upsert to allow overwriting
      const { error: uploadError } = await supabase.storage.from('avatars').upload(filePath, file, {
        cacheControl: '3600',
        contentType: file.type,
        upsert: true,
      });

      if (uploadError) throw uploadError;

      // Get public URL
      const {
        data: { publicUrl },
      } = supabase.storage.from('avatars').getPublicUrl(filePath);

      // Update profile with new avatar URL immediately
      const { error: profileError } = await updateProfile({
        avatar_url: publicUrl,
      });

      if (profileError) throw profileError;

      toast({
        title: 'Photo uploaded',
        description: 'Your profile photo has been updated.',
      });
    } catch (error: unknown) {
      if (import.meta.env.DEV) console.error('Error uploading photo:', error);
      const errMsg =
        (error as { message?: string; statusCode?: string })?.message ||
        (error as { statusCode?: string })?.statusCode ||
        '';
      let description = 'Failed to upload profile photo. Please try again.';
      if (typeof errMsg === 'string') {
        if (errMsg.includes('Bucket not found') || errMsg.includes('not found')) {
          description = 'Storage bucket not configured. Please contact support.';
        } else if (errMsg.includes('row-level security') || errMsg.includes('security policy')) {
          description = 'Permission denied. Please ensure you are signed in.';
        } else if (errMsg.includes('Payload too large') || errMsg.includes('413')) {
          description = 'File is too large. Maximum size is 5MB.';
        }
      }
      toast({
        title: 'Upload failed',
        description,
        variant: 'destructive',
      });
    } finally {
      setIsUploading(false);
      // Reset file input
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const triggerFileInput = () => {
    fileInputRef.current?.click();
  };

  return (
    <div className="space-y-3">
      {/* Profile Photo */}
      <div className="bg-white/5 border border-white/10 rounded-xl p-3">
        <h4 className="text-base font-semibold text-white mb-2">Profile Photo</h4>
        <div className="flex flex-col items-center gap-4">
          <div className="w-20 h-20 bg-gradient-to-r from-gold-primary to-gold-mid rounded-full flex items-center justify-center overflow-hidden">
            {currentUser.avatar ? (
              <img src={currentUser.avatar} alt="Profile" className="w-full h-full object-cover" />
            ) : (
              <User size={24} className="text-primary-foreground" />
            )}
          </div>
          <input
            type="file"
            ref={fileInputRef}
            className="hidden"
            accept="image/*"
            onChange={handleFileSelect}
          />
          <button
            onClick={triggerFileInput}
            disabled={isUploading || (!user && !showDemoContent)}
            className="flex items-center gap-2 bg-white/10 hover:bg-white/20 border border-white/20 text-white px-4 py-2 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isUploading ? (
              <>
                <div className="h-4 w-4 animate-spin gold-gradient-spinner" />
                Uploading...
              </>
            ) : (
              <>
                <Upload size={16} />
                Upload Photo
              </>
            )}
          </button>
          <p className="text-sm text-gray-400 mt-2">JPG, PNG or GIF. Max size 5MB.</p>
        </div>
      </div>

      {/* Personal Information - 2x2 grid: Real Name | Email, Display Name | Phone */}
      <div className="bg-white/5 border border-white/10 rounded-xl p-3">
        <h4 className="text-base font-semibold text-white mb-2">Personal Information</h4>
        <div className="grid md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm text-gray-300 mb-1.5">Real Name</label>
            <input
              type="text"
              aria-label="Real name"
              value={realName}
              onChange={e => setRealName(e.target.value)}
              className="w-full bg-gray-800/50 border border-gray-600 text-white rounded-lg px-4 py-2 min-h-[44px] focus:outline-none focus:ring-2 focus:ring-primary/50"
              placeholder="Enter your real name"
            />
            <p className="text-xs text-gray-500 mt-1">
              Used when you choose to show your real name.
            </p>
          </div>
          <div>
            <label className="block text-sm text-gray-300 mb-1.5">Email</label>
            <input
              type="email"
              aria-label="Email address"
              value={currentUser.email || ''}
              disabled
              className="w-full bg-gray-700/50 border border-gray-600 text-gray-400 rounded-lg px-4 py-2 min-h-[44px] cursor-not-allowed"
            />
          </div>
          <div>
            <label className="block text-sm text-gray-300 mb-1.5">Display Name</label>
            <input
              type="text"
              aria-label="Display name"
              value={displayName}
              onChange={e => setDisplayName(e.target.value)}
              className="w-full bg-gray-800/50 border border-gray-600 text-white rounded-lg px-4 py-2 min-h-[44px] focus:outline-none focus:ring-2 focus:ring-primary/50"
              placeholder="Nickname or role (e.g., Tour Manager, Security)"
            />
            <p className="text-xs text-gray-500 mt-1">
              Can be a nickname or role (e.g., Tour Manager, Security, Photographer).
            </p>
          </div>
          <div>
            <label className="block text-sm text-gray-300 mb-1.5 flex items-center gap-2">
              <Phone size={14} />
              Phone Number
            </label>
            <input
              type="tel"
              aria-label="Phone number"
              value={phone}
              onChange={e => setPhone(e.target.value)}
              className="w-full bg-gray-800/50 border border-gray-600 text-white rounded-lg px-4 py-2 min-h-[44px] focus:outline-none focus:ring-2 focus:ring-primary/50"
              placeholder="+1 (555) 123-4567"
            />
            <p className="text-xs text-gray-500 mt-1">
              Used for direct contact if you choose to share it with your trip.
            </p>
          </div>
        </div>

        {/* Save Button */}
        <div className="mt-4 flex justify-end">
          <button
            onClick={handleSave}
            disabled={isSaving || (!user && !showDemoContent)}
            aria-label="Save profile changes"
            className="bg-primary hover:bg-primary/80 text-primary-foreground font-medium px-6 py-2 min-h-[44px] rounded-lg transition-colors flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isSaving ? (
              <>
                <div className="h-[18px] w-[18px] animate-spin gold-gradient-spinner" />
                Saving...
              </>
            ) : (
              'Save Changes'
            )}
          </button>
        </div>
      </div>

      {/* Account actions — email shown in SettingsMenu header */}
      {user && (
        <div className="bg-white/5 border border-white/10 rounded-xl p-3">
          <h4 className="text-base font-semibold text-white mb-3">Account</h4>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setShowDeleteDialog(true)}
              className="flex-1 min-w-0 bg-destructive hover:bg-destructive/80 text-destructive-foreground font-medium px-4 py-2 min-h-[44px] rounded-lg transition-colors flex items-center justify-center gap-2 whitespace-nowrap"
            >
              <Trash2 size={16} />
              Delete Account
            </button>
            <button
              type="button"
              onClick={() => signOut()}
              className="flex-1 min-w-0 bg-destructive hover:bg-destructive/80 text-destructive-foreground font-medium px-4 py-2 min-h-[44px] rounded-lg transition-colors flex items-center justify-center gap-2 whitespace-nowrap"
            >
              <LogOut size={16} />
              Sign Out
            </button>
          </div>
        </div>
      )}
      <DeleteAccountDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog} />
    </div>
  );
};
