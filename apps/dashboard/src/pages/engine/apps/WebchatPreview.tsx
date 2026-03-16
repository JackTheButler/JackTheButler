import React from 'react';

/**
 * Webchat Widget Preview
 *
 * Live preview of the webchat widget appearance based on current config form values.
 * Mirrors the actual widget structure, styles, and dark/light theme values exactly.
 */

/** Return white or dark text depending on background luminance */
function contrastColor(hex: string): string {
  try {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    return luminance > 0.5 ? '#1a1a2e' : '#ffffff';
  } catch {
    return '#ffffff';
  }
}

const BUTTON_SVGS: Record<string, string> = {
  chat: '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>',
  bell: '<path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/>',
  dots: '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/><circle cx="8" cy="10" r="1" fill="currentColor" stroke="none"/><circle cx="12" cy="10" r="1" fill="currentColor" stroke="none"/><circle cx="16" cy="10" r="1" fill="currentColor" stroke="none"/>',
  headset:
    '<path d="M3 18v-6a9 9 0 0 1 18 0v6"/><path d="M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3z"/><path d="M3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3z"/>',
};

export interface WebchatPreviewProps {
  primaryColor: string;
  headerBackground: string;
  botName: string;
  logoUrl: string;
  logoRadius: string;
  welcomeMessage: string;
  buttonIcon: string;
  theme: string;
}


export function WebchatPreview({
  primaryColor,
  headerBackground,
  botName,
  logoUrl,
  logoRadius,
  welcomeMessage,
  buttonIcon,
  theme,
}: WebchatPreviewProps) {
  const [isOpen, setIsOpen] = React.useState(true);
  const isDark = theme === 'dark';

  // Match exact values from apps/webchat/src/widget.ts dark theme overrides
  const bgPanel = isDark ? '#1e1e2e' : '#ffffff';
  const bgMessages = isDark ? '#181825' : '#f7f8fa';
  const bgBubbleAi = isDark ? '#2a2a3e' : '#ffffff';
  const borderBubbleAi = isDark ? '#3a3a4e' : '#e0e0e0';
  const borderColor = isDark ? '#3a3a4e' : '#e0e0e0';
  const textPrimary = isDark ? '#e0e0e0' : '#1a1a2e';
  const textLight = isDark ? '#707070' : '#999999';

  const headerText = contrastColor(headerBackground);
  const guestText = contrastColor(primaryColor);

  const displayName = botName || 'Hotel Concierge';
  const displayWelcome = welcomeMessage || 'Welcome! How can I assist you today?';
  const iconSvg = BUTTON_SVGS[buttonIcon] ?? BUTTON_SVGS.chat;

  const QUICK_REPLIES = ['Room Service', 'Housekeeping', 'Extend Stay', 'Something Else'];

  // Bubble shared styles matching .butler-msg
  const aiBubbleStyle: React.CSSProperties = {
    background: bgBubbleAi,
    color: textPrimary,
    border: `1px solid ${borderBubbleAi}`,
    borderRadius: 12,
    borderBottomLeftRadius: 4,
    padding: '10px 14px',
    maxWidth: '80%',
    alignSelf: 'flex-start',
    fontSize: 13,
    lineHeight: 1.45,
    wordBreak: 'break-word',
  };

  const guestBubbleStyle: React.CSSProperties = {
    background: primaryColor,
    color: guestText,
    borderRadius: 12,
    borderBottomRightRadius: 4,
    padding: '10px 14px',
    maxWidth: '80%',
    alignSelf: 'flex-end',
    fontSize: 13,
    lineHeight: 1.45,
    wordBreak: 'break-word',
  };

  // Label matching .butler-msg-label
  const labelStyle: React.CSSProperties = {
    fontSize: 10,
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
    marginBottom: 3,
    opacity: 0.7,
    fontWeight: 500,
  };

  return (
    <div className="w-full max-w-[380px]">
      <div className="relative w-full">
        {/* Chat panel */}
        <div style={{ visibility: isOpen ? 'visible' : 'hidden' }}><div
          className="rounded-2xl overflow-hidden shadow-2xl"
          style={{ border: `1px solid ${borderColor}`, background: bgPanel }}
        >
          {/* Header — matches .butler-header */}
          <div
            className="flex items-center gap-2.5 px-4 py-3"
            style={{ background: headerBackground }}
          >
            {/* Logo or fallback icon — matches .butler-header-logo */}
            <div
              className="w-8 h-8 shrink-0 overflow-hidden flex items-center justify-center"
              style={{
                borderRadius: logoRadius || '50%',
                background:
                  headerText === '#ffffff' ? 'rgba(255,255,255,0.18)' : 'rgba(0,0,0,0.1)',
              }}
            >
              {logoUrl ? (
                <img
                  src={logoUrl}
                  alt=""
                  className="w-full h-full object-cover"
                  onError={(e) => {
                    (e.currentTarget as HTMLImageElement).style.display = 'none';
                  }}
                />
              ) : (
                <svg
                  width="15"
                  height="15"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke={headerText}
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  dangerouslySetInnerHTML={{ __html: BUTTON_SVGS.chat }}
                />
              )}
            </div>

            {/* Title — matches .butler-header-title */}
            <span
              className="flex-1 truncate font-semibold"
              style={{ color: headerText, fontSize: 15 }}
            >
              {displayName}
            </span>

            {/* Globe icon (decorative) */}
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke={headerText}
              strokeWidth="2"
              strokeLinecap="round"
              style={{ opacity: 0.7 }}
            >
              <circle cx="12" cy="12" r="10" />
              <line x1="2" y1="12" x2="22" y2="12" />
              <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
            </svg>

            {/* Close button (decorative) — matches .butler-header-close */}
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke={headerText}
              strokeWidth="2.5"
              strokeLinecap="round"
              style={{ opacity: 0.7 }}
            >
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </div>

          {/* Message list — matches .butler-messages: padding 16px, gap 6px */}
          <div
            className="flex flex-col px-4 py-4"
            style={{ background: bgMessages, minHeight: 200, gap: 6 }}
          >
            {/* AI welcome bubble */}
            <div style={aiBubbleStyle}>
              <div style={labelStyle}>AI</div>
              <div>{displayWelcome}</div>
              {/* Quick replies inside the bubble — matches .butler-quick-replies */}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
                {QUICK_REPLIES.map((label) => (
                  <div
                    key={label}
                    style={{
                      padding: '5px 12px',
                      borderRadius: 14,
                      border: `1px solid ${primaryColor}`,
                      color: primaryColor,
                      fontSize: 11,
                      background: 'transparent',
                    }}
                  >
                    {label}
                  </div>
                ))}
              </div>
            </div>

            {/* Guest message */}
            <div style={guestBubbleStyle}>
              <div style={labelStyle}>You</div>
              <div>I'd like to request extra towels please</div>
            </div>

            {/* AI response */}
            <div style={aiBubbleStyle}>
              <div style={labelStyle}>AI</div>
              <div>Of course! I'll arrange that right away for you.</div>
            </div>
          </div>

          {/* Input bar — matches .butler-input-bar */}
          <div
            className="flex items-center gap-2 px-4 py-3"
            style={{ background: bgPanel, borderTop: `1px solid ${borderColor}` }}
          >
            {/* Input field — matches .butler-input */}
            <div
              className="flex-1 px-4 py-2 text-xs"
              style={{
                border: `1px solid ${borderColor}`,
                borderRadius: 20,
                background: bgPanel,
                color: textLight,
              }}
            >
              Type a message...
            </div>
            {/* Send button — matches .butler-send-btn: 38px circle */}
            <div
              className="shrink-0 flex items-center justify-center"
              style={{
                width: 34,
                height: 34,
                borderRadius: '50%',
                background: primaryColor,
              }}
            >
              <svg
                width="13"
                height="13"
                viewBox="0 0 24 24"
                fill="none"
                stroke={guestText}
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <line x1="22" y1="2" x2="11" y2="13" />
                <polygon points="22 2 15 22 11 13 2 9 22 2" />
              </svg>
            </div>
          </div>
        </div></div>

        {/* Floating CTA button — toggles open/close */}
        <div className="flex justify-end mt-3">
          <button
            type="button"
            onClick={() => setIsOpen((v) => !v)}
            className="flex items-center justify-center shadow-lg transition-transform hover:scale-105 active:scale-95"
            style={{ width: 48, height: 48, borderRadius: '50%', background: primaryColor }}
          >
            <svg
              width="22"
              height="22"
              viewBox="0 0 24 24"
              fill="none"
              stroke={guestText}
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              dangerouslySetInnerHTML={{ __html: iconSvg }}
            />
          </button>
        </div>
      </div>
    </div>
  );
}
