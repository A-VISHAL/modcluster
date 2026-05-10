import { Devvit } from '@devvit/public-api';

export const QueueScreen = () => {
  return (
    <vstack width="100%" grow backgroundColor="neutral-background-weak">
      <hstack padding="medium" alignment="middle" borderColor="neutral-border">
        <vstack grow>
          <hstack alignment="middle" gap="small">
            <text size="large" weight="bold" color="neutral-content-strong">Emergency Live Queue</text>
            <hstack backgroundColor="critical-background" cornerRadius="small" padding="xsmall">
              <text size="small" weight="bold" color="white">LIVE</text>
            </hstack>
          </hstack>
        </vstack>
        <hstack gap="small">
          <icon name="filter" color="neutral-content-weak" />
          <icon name="refresh" color="neutral-content-weak" />
        </hstack>
      </hstack>

      <hstack padding="medium" gap="medium">
        <vstack grow padding="small" cornerRadius="medium" borderColor="neutral-border" border="thick" alignment="center middle">
          <text size="small" weight="bold" color="neutral-content-weak">UNRESOLVED</text>
          <text size="xlarge" weight="bold" color="primary-background">124</text>
        </vstack>
        <vstack grow padding="small" cornerRadius="medium" borderColor="neutral-border" border="thick" alignment="center middle">
          <text size="small" weight="bold" color="neutral-content-weak">AVG RESPONSE</text>
          <text size="xlarge" weight="bold" color="primary-background">1.2m</text>
        </vstack>
      </hstack>

      <vstack padding="medium" gap="medium" grow>
        <vstack cornerRadius="medium" borderColor="neutral-border" border="thick" backgroundColor="neutral-background">
          <hstack padding="small" alignment="middle">
            <hstack gap="small">
              <text weight="bold" color="neutral-content-strong">u/UserA</text>
              <text color="neutral-content-weak">• 2m ago</text>
            </hstack>
            <spacer grow />
            <hstack backgroundColor="neutral-background-weak" cornerRadius="full" padding="xsmall">
              <text size="small" weight="bold" color="neutral-content-weak">SPAM</text>
            </hstack>
          </hstack>
          
          <vstack padding="small">
            <text color="neutral-content">"Check out this amazing crypto deal at bit.ly/scamlink! Don't miss out on free tokens!"</text>
          </vstack>

          <hstack padding="small" gap="small">
            <hstack backgroundColor="neutral-background-weak" cornerRadius="small" padding="xsmall">
              <text size="small" color="neutral-content-weak">Repeated Link</text>
            </hstack>
            <hstack backgroundColor="neutral-background-weak" cornerRadius="small" padding="xsmall">
              <text size="small" color="neutral-content-weak">New Account</text>
            </hstack>
          </hstack>

          <hstack border="thick" borderColor="neutral-border">
            <hstack grow padding="small" alignment="center middle" gap="small" onPress={() => {}}>
              <icon name="checkmark" color="success-content" />
              <text weight="bold" color="success-content">Approve</text>
            </hstack>
            <hstack width="1px" backgroundColor="neutral-border" />
            <hstack grow padding="small" alignment="center middle" gap="small" onPress={() => {}}>
              <icon name="close" color="critical-content" />
              <text weight="bold" color="critical-content">Remove</text>
            </hstack>
            <hstack width="1px" backgroundColor="neutral-border" />
            <hstack padding="small" alignment="center middle" onPress={() => {}}>
              <icon name="overflow-horizontal" color="neutral-content-weak" />
            </hstack>
          </hstack>
        </vstack>

        <vstack cornerRadius="medium" borderColor="neutral-border" border="thick" backgroundColor="neutral-background">
          <hstack padding="small" alignment="middle">
            <hstack gap="small">
              <text weight="bold" color="neutral-content-strong">u/UserB</text>
              <text color="neutral-content-weak">• 5m ago</text>
            </hstack>
            <spacer grow />
            <hstack backgroundColor="critical-background-weak" cornerRadius="full" padding="xsmall">
              <text size="small" weight="bold" color="critical-content">HARASSMENT</text>
            </hstack>
          </hstack>
          
          <vstack padding="small" gap="small">
            <text color="neutral-content">Multiple toxic comments targeted at OP in thread ID: #9842. Pattern of aggressive behavior detected.</text>
            <hstack padding="small" backgroundColor="neutral-background-weak">
              <text color="neutral-content-weak">"You're absolutely clueless and should leave the sub..."</text>
            </hstack>
          </vstack>

          <hstack border="thick" borderColor="neutral-border">
            <hstack grow padding="small" alignment="center middle" gap="small" onPress={() => {}}>
              <icon name="checkmark" color="success-content" />
              <text weight="bold" color="success-content">Approve</text>
            </hstack>
            <hstack width="1px" backgroundColor="neutral-border" />
            <hstack grow padding="small" alignment="center middle" gap="small" onPress={() => {}}>
              <icon name="ban" color="critical-content" />
              <text weight="bold" color="critical-content">Ban</text>
            </hstack>
            <hstack width="1px" backgroundColor="neutral-border" />
            <hstack padding="small" alignment="center middle" onPress={() => {}}>
              <icon name="overflow-horizontal" color="neutral-content-weak" />
            </hstack>
          </hstack>
        </vstack>
      </vstack>
    </vstack>
  );
};
