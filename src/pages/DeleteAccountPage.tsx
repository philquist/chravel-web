import { ArrowLeft, Trash2, Clock, Mail, ShieldCheck } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';

export default function DeleteAccountPage() {
  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-8 max-w-4xl">
        <Link to="/">
          <Button variant="ghost" className="mb-8">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back
          </Button>
        </Link>

        <div className="prose prose-invert max-w-none">
          <h1 className="text-4xl font-bold mb-4">Delete Your Account</h1>
          <p className="text-muted-foreground mb-8">
            We're sorry to see you go. Here's how to delete your ChravelApp account and what happens
            to your data.
          </p>

          <section className="mb-8">
            <div className="flex items-center gap-3 mb-4">
              <Trash2 className="h-6 w-6 text-primary" />
              <h2 className="text-2xl font-semibold m-0">How to Delete Your Account</h2>
            </div>
            <ol className="space-y-3 text-foreground/90 list-decimal list-inside">
              <li>
                Open the Chravel app or visit <strong>chravel.app</strong>
              </li>
              <li>Sign in to your account</li>
              <li>
                Go to <strong>Settings → General Settings → Account Management</strong>
              </li>
              <li>
                Tap <strong>"Delete Account"</strong>
              </li>
              <li>
                Confirm the deletion by typing <strong>DELETE</strong>
              </li>
              <li>
                If you signed up with email and password, re-enter your password to verify your
                identity
              </li>
            </ol>
          </section>

          <section className="mb-8">
            <div className="flex items-center gap-3 mb-4">
              <ShieldCheck className="h-6 w-6 text-primary" />
              <h2 className="text-2xl font-semibold m-0">What Data Gets Deleted</h2>
            </div>
            <p className="text-foreground/90 mb-3">
              When you delete your account, the following data is permanently removed:
            </p>
            <ul className="space-y-2 text-foreground/90 list-disc list-inside">
              <li>Your profile information (name, email, avatar, bio)</li>
              <li>Trips you created and your membership in shared trips</li>
              <li>Messages, chat history, and broadcast messages</li>
              <li>Uploaded media (photos, videos, files)</li>
              <li>Payment and expense splitting history</li>
              <li>AI Concierge conversation history</li>
              <li>Saved places, tasks, polls, and calendar events</li>
              <li>Notification preferences and device tokens</li>
            </ul>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold mb-4">What Data May Be Retained</h2>
            <ul className="space-y-2 text-foreground/90 list-disc list-inside">
              <li>
                <strong>Anonymized analytics</strong> — aggregated usage data (with no personal
                identifiers) may be retained for up to 90 days
              </li>
              <li>
                <strong>Legal & financial records</strong> — transaction records may be retained as
                required by applicable law and regulatory obligations
              </li>
              <li>
                <strong>Abuse reports</strong> — reports related to safety or trust violations may
                be retained to protect the community
              </li>
            </ul>
          </section>

          <section className="mb-8">
            <div className="flex items-center gap-3 mb-4">
              <Clock className="h-6 w-6 text-primary" />
              <h2 className="text-2xl font-semibold m-0">Immediate Deletion</h2>
            </div>
            <p className="text-foreground/90">
              Account deletion is processed <strong>immediately</strong> after you confirm. You will
              be signed out and your account data will be permanently removed. This action is{' '}
              <strong>irreversible</strong>.
            </p>
          </section>

          <section className="mb-8">
            <div className="flex items-center gap-3 mb-4">
              <Mail className="h-6 w-6 text-primary" />
              <h2 className="text-2xl font-semibold m-0">Can't Access Your Account?</h2>
            </div>
            <p className="text-foreground/90 mb-4">
              If you're unable to sign in to request deletion, you can contact our support team and
              we'll process your request manually after verifying your identity.
            </p>
            <a
              href="mailto:support@chravel.app?subject=Account%20Deletion%20Request"
              className="flex items-center gap-3 p-4 rounded-lg bg-muted/50 hover:bg-muted transition-colors no-underline text-foreground"
            >
              <Mail className="h-6 w-6 text-primary" />
              <div>
                <p className="font-medium">Email Support</p>
                <p className="text-sm text-muted-foreground">support@chravel.app</p>
              </div>
            </a>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold mb-4">Related Policies</h2>
            <ul className="space-y-2">
              <li>
                <Link to="/privacy" className="text-primary hover:underline">
                  Privacy Policy
                </Link>
              </li>
              <li>
                <Link to="/terms" className="text-primary hover:underline">
                  Terms of Service
                </Link>
              </li>
              <li>
                <Link to="/support" className="text-primary hover:underline">
                  Support
                </Link>
              </li>
            </ul>
          </section>
        </div>
      </div>
    </div>
  );
}
