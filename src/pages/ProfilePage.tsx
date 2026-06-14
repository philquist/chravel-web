import { Archive, Camera, Share2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { InteractiveButton } from '../components/ui/interactive-button';
import { Avatar, AvatarFallback, AvatarImage } from '../components/ui/avatar';
import { useAuth } from '../hooks/useAuth';
import { SavedPlacesInline } from '../components/profile/SavedPlacesInline';

const ProfilePage = () => {
  const { user } = useAuth();
  const navigate = useNavigate();

  const displayName = user?.name || user?.email?.split('@')[0] || 'User';

  return (
    <div className="min-h-screen bg-background text-foreground p-4 md:p-6">
      {/* Profile Header */}
      <div className="text-center mb-8 animate-fade-in">
        <Avatar className="w-24 h-24 mx-auto mb-4 transition-all duration-200 hover:scale-105">
          <AvatarImage src={user?.avatar_url || undefined} alt={displayName} />
          <AvatarFallback className="bg-muted text-foreground text-2xl">
            {displayName.charAt(0).toUpperCase()}
          </AvatarFallback>
        </Avatar>

        <h1 className="text-2xl font-bold mb-1">{displayName}</h1>
        {user?.email && <p className="text-muted-foreground mb-4">{user.email}</p>}
      </div>

      <SavedPlacesInline />

      {/* Quick Actions with enhanced interactions */}
      <div className="space-y-3 mb-8">
        <InteractiveButton
          variant="outline"
          className="w-full justify-start h-12"
          size="lg"
          onClick={() => navigate('/')}
          microAnimation="scale"
        >
          <Camera className="mr-3" size={18} />
          Manage Photos & Memories
        </InteractiveButton>

        <InteractiveButton
          variant="outline"
          className="w-full justify-start h-12"
          size="lg"
          onClick={() => navigate('/archive')}
          microAnimation="scale"
        >
          <Archive className="mr-3" size={18} />
          Archived Trips
        </InteractiveButton>

        <InteractiveButton
          variant="outline"
          className="w-full justify-start h-12"
          size="lg"
          onClick={() => navigate('/')}
          microAnimation="scale"
        >
          <Share2 className="mr-3" size={18} />
          Shared Trip Links
        </InteractiveButton>
      </div>
    </div>
  );
};

export default ProfilePage;
