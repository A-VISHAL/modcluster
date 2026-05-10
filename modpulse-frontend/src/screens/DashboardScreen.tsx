import { Devvit } from '@devvit/public-api';

export const DashboardScreen = () => {
  return (
    <vstack width="100%" grow backgroundColor="neutral-background-weak">
      <hstack padding="medium" alignment="middle" borderColor="neutral-border">
        <text size="large" weight="bold" color="neutral-content-strong">Moderation Pulse</text>
        <spacer grow />
        <text color="neutral-content-weak">Live Now</text>
      </hstack>

      <vstack padding="medium" gap="medium" grow>
        <hstack alignment="middle">
          <text size="xlarge" weight="bold" color="neutral-content-strong">Steady</text>
          <icon name="up" color="success-content" size="small" />
        </hstack>

        <hstack gap="medium">
          <vstack grow padding="medium" cornerRadius="medium" borderColor="neutral-border" border="thick" backgroundColor="neutral-background">
            <text size="small" weight="bold" color="neutral-content-weak">UNRESOLVED</text>
            <text size="xxlarge" weight="bold" color="neutral-content-strong">124</text>
          </vstack>
          <vstack grow padding="medium" cornerRadius="medium" borderColor="neutral-border" border="thick" backgroundColor="neutral-background">
            <text size="small" weight="bold" color="neutral-content-weak">RESPONSE</text>
            <text size="xxlarge" weight="bold" color="neutral-content-strong">1.2m</text>
          </vstack>
        </hstack>

        <text size="small" weight="bold" color="neutral-content-weak">MOD TOOLS</text>
        <hstack gap="medium">
          <hstack grow padding="medium" cornerRadius="medium" borderColor="neutral-border" border="thick" backgroundColor="neutral-background" alignment="middle" gap="small">
            <icon name="checkmark-outline" color="neutral-content-weak" />
            <text color="neutral-content-strong">Approve All</text>
          </hstack>
          <hstack grow padding="medium" cornerRadius="medium" borderColor="neutral-border" border="thick" backgroundColor="neutral-background" alignment="middle" gap="small">
            <icon name="ban" color="neutral-content-weak" />
            <text color="neutral-content-strong">Ban User</text>
          </hstack>
        </hstack>

        <vstack padding="small">
          <text size="small" weight="bold" color="neutral-content-weak">HEALTH & PRESENCE</text>
        </vstack>
        
        <hstack padding="medium" cornerRadius="medium" borderColor="neutral-border" border="thick" backgroundColor="neutral-background" alignment="middle" gap="small">
          <icon name="topic-business" color="neutral-content-weak" />
          <vstack>
            <text weight="bold" color="neutral-content-strong">Sentiment</text>
            <text size="small" color="neutral-content-weak">4.2/5 Positive</text>
          </vstack>
          <spacer grow />
          <icon name="caret-right" color="neutral-content-weak" />
        </hstack>

        <hstack padding="medium" alignment="middle">
          <text color="neutral-content-strong">Active Mods</text>
          <spacer grow />
          <text size="small" color="primary-background" weight="bold">8 Online</text>
        </hstack>
      </vstack>
    </vstack>
  );
};
