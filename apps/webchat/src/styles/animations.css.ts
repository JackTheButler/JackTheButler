/**
 * Animation Styles
 */

export const animationStyles = `
@keyframes butler-typing-bounce {
  0%, 60%, 100% {
    transform: translateY(0);
    opacity: 0.4;
  }
  30% {
    transform: translateY(-4px);
    opacity: 1;
  }
}

@keyframes butler-fade-in {
  from {
    opacity: 0;
    transform: translateY(4px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.butler-fade-in {
  animation: butler-fade-in 200ms ease-out;
}

.butler-typing {
  padding: 4px 16px;
}

.butler-typing-dots {
  display: flex;
  align-items: center;
  gap: 4px;
}

.butler-typing-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--butler-color-primary);
  animation: butler-typing-bounce 1.4s infinite;
}

.butler-typing-dot:nth-child(2) {
  animation-delay: 0.2s;
}

.butler-typing-dot:nth-child(3) {
  animation-delay: 0.4s;
}
`;
