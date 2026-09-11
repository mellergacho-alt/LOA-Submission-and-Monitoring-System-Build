import { useEffect, useRef, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { landingPathFor } from "../utils/nav";
import { LockIcon, ChevronDownIcon } from "../icons/Icons";
import "../styles/forms.css";
import "./LoginPage.css";

// Loaded via the <script> tag in index.html (Google Identity Services) --
// only declaring the small slice of its API this page actually calls. Uses
// the oauth2 *popup* token client, not accounts.id's One Tap/prompt() flow --
// One Tap relies on Chrome's FedCM API, which silently disables itself for a
// site after a user dismisses the prompt a couple of times (confirmed live:
// "Provider's accounts list is empty" / a 403 from Google's own gsi/status
// endpoint, with zero indication to the user why sign-in stopped working).
// The classic OAuth popup isn't FedCM-based, so it isn't subject to that.
declare global {
  interface Window {
    google?: {
      accounts: {
        oauth2: {
          initTokenClient: (config: {
            client_id: string;
            scope: string;
            callback: (response: { access_token?: string; error?: string }) => void;
          }) => { requestAccessToken: () => void };
        };
      };
    };
  }
}

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined;

function GoogleLogoIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 18 18" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.91c1.7-1.57 2.69-3.88 2.69-6.62Z"
      />
      <path
        fill="#34A853"
        d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.91-2.26c-.81.54-1.85.86-3.05.86-2.34 0-4.33-1.58-5.04-3.71H.96v2.33A9 9 0 0 0 9 18Z"
      />
      <path
        fill="#FBBC05"
        d="M3.96 10.71A5.4 5.4 0 0 1 3.68 9c0-.59.1-1.17.28-1.71V4.96H.96A9 9 0 0 0 0 9c0 1.45.35 2.83.96 4.04l3-2.33Z"
      />
      <path
        fill="#EA4335"
        d="M9 3.58c1.32 0 2.51.46 3.44 1.35l2.58-2.59C13.46.89 11.43 0 9 0A9 9 0 0 0 .96 4.96l3 2.33C4.67 5.16 6.66 3.58 9 3.58Z"
      />
    </svg>
  );
}

function ArrowRightIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <line x1="5" y1="12" x2="19" y2="12" />
      <polyline points="12 5 19 12 12 19" />
    </svg>
  );
}

export default function LoginPage() {
  const { user, loading, login, loginWithGoogle } = useAuth();
  const navigate = useNavigate();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [manualOpen, setManualOpen] = useState(false);

  // "Sign in with Google" only ever authenticates an email that already has
  // an account here (see googleLogin() in auth.controller.ts) -- it never
  // creates one. The button below is always visible; it just can't do
  // anything useful until the app is configured with a real Google OAuth
  // Client ID (see GOOGLE_CLIENT_ID's check in handleGoogleClick).
  const tokenClientRef = useRef<{ requestAccessToken: () => void } | null>(null);

  useEffect(() => {
    if (!GOOGLE_CLIENT_ID) return;

    async function handleTokenResponse(response: { access_token?: string; error?: string }) {
      setError(null);
      if (!response.access_token) {
        // error === "popup_closed_by_user" when the user just cancels --
        // not worth surfacing as an error in that case.
        if (response.error && response.error !== "popup_closed_by_user") {
          setError("Unable to sign in with Google. Please try again.");
        }
        return;
      }
      try {
        const loggedInUser = await loginWithGoogle(response.access_token);
        navigate(landingPathFor(loggedInUser.role), { replace: true });
      } catch (err: any) {
        setError(err?.response?.data?.message ?? "Unable to sign in with Google. Please try again.");
      }
    }

    function initIfReady() {
      if (!window.google?.accounts?.oauth2) return false;
      tokenClientRef.current = window.google.accounts.oauth2.initTokenClient({
        client_id: GOOGLE_CLIENT_ID!,
        scope: "openid email profile",
        callback: handleTokenResponse,
      });
      return true;
    }

    if (initIfReady()) return;
    // The script tag is async/defer, so it may not have finished loading yet.
    const interval = setInterval(() => {
      if (initIfReady()) clearInterval(interval);
    }, 200);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleGoogleClick() {
    setError(null);
    if (!GOOGLE_CLIENT_ID || !tokenClientRef.current) {
      setError("Google Sign-In is not yet configured for this system.");
      return;
    }
    tokenClientRef.current.requestAccessToken();
  }

  if (!loading && user) {
    return <Navigate to={landingPathFor(user.role)} replace />;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const loggedInUser = await login(email, password);
      navigate(landingPathFor(loggedInUser.role), { replace: true });
    } catch (err: any) {
      setError(err?.response?.data?.message ?? "Unable to log in. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="login-screen">
      <div className="login-screen__backdrop" />
      <div className="login-split-card">
        <div className="login-split-card__panel login-split-card__panel--form">
          <div className="login-split-card__brand">
            <img className="login-split-card__logo login-split-card__logo--small" src="/division-logo.png" alt="Division of Guihulngan City logo" />
            <div>
              <div className="login-split-card__wordmark login-split-card__wordmark--dark">LOA System</div>
              <div className="login-split-card__wordmark-sub login-split-card__wordmark-sub--dark">Division of Guihulngan City</div>
            </div>
          </div>

          <h2 className="login-split-card__heading">Welcome Back!</h2>
          <p className="login-split-card__subtitle">Sign in to access the LOA Submission and Monitoring System.</p>

          <button type="button" className="btn btn--google login-google__btn login-google__btn--primary" onClick={handleGoogleClick}>
            <span className="login-google__btn-main">
              <span className="login-google__btn-icon">
                <GoogleLogoIcon />
              </span>
              Sign in with DepEd Google Account
            </span>
            <ArrowRightIcon />
          </button>

          {error && <div className="login-error">{error}</div>}

          <div className="login-google__divider">
            <span>or continue</span>
          </div>

          <button
            type="button"
            className="login-manual-toggle"
            aria-expanded={manualOpen}
            onClick={() => setManualOpen((open) => !open)}
          >
            <LockIcon />
            Admin / Manual Login
            <ChevronDownIcon className={manualOpen ? "login-manual-toggle__chevron login-manual-toggle__chevron--open" : "login-manual-toggle__chevron"} />
          </button>

          {manualOpen && (
            <form className="login-form" onSubmit={handleSubmit}>
              <div className="form-field">
                <label>Email</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@deped.gov.ph"
                  autoComplete="username"
                  required
                />
              </div>
              <div className="form-field">
                <label>Password</label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  autoComplete="current-password"
                  required
                />
              </div>

              <button className="btn btn--primary login-submit" type="submit" disabled={submitting}>
                {submitting ? "Signing In..." : "Sign In"}
              </button>
            </form>
          )}

          <p className="login-split-card__copyright">
            Only accounts already added by your administrator can sign in.
            <br />© {new Date().getFullYear()} Department of Education — Division of Guihulngan City
            <br />Powered by Meller, Eric and Joh
          </p>
        </div>

        <div className="login-split-card__panel login-split-card__panel--mantra">
          <div className="login-mantra__divider" />
          <p className="login-mantra__text">
            "Sa DepEd Guihulngan, ang edukasyong dekalidad, malipayon namo'ng ialagad. Dan-ag DepEd Guihulngan!"
          </p>
        </div>
      </div>
    </div>
  );
}
