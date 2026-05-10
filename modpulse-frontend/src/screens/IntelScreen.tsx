import { Devvit } from '@devvit/public-api';

export const IntelScreen = () => {
  return (
    <vstack width="100%" grow backgroundColor="neutral-background-weak">
      <hstack padding="medium" alignment="middle" borderColor="neutral-border">
        <text size="large" weight="bold" color="neutral-content-strong">Pressure Intelligence</text>
        <spacer grow />
        <hstack backgroundColor="success-background" cornerRadius="small" padding="xsmall">
          <text size="small" weight="bold" color="success-content">ACTIVE</text>
        </hstack>
      </hstack>

      <vstack padding="medium" gap="medium" grow>
        <vstack padding="medium" cornerRadius="medium" borderColor="neutral-border" border="thick" backgroundColor="neutral-background" gap="small">
          <hstack gap="small" alignment="middle">
            <icon name="warning" color="critical-content" />
            <text weight="bold" color="neutral-content-strong">CRITICAL PRIORITY</text>
          </hstack>
          <text size="large" weight="bold" color="neutral-content-strong">Queue spike detected in /new</text>
          <text color="neutral-content-strong">Average wait time increased to 14m. Recommendation: Deploy 2 additional mods to Live Queue.</text>
        </vstack>

        <hstack gap="medium">
          <vstack grow padding="medium" cornerRadius="medium" borderColor="neutral-border" border="thick" backgroundColor="neutral-background">
            <hstack alignment="middle">
              <text size="small" weight="bold" color="neutral-content-weak">QUEUE PRESSURE</text>
              <spacer grow />
              <text size="small" color="neutral-content-weak">High</text>
            </hstack>
            <text size="xxlarge" weight="bold" color="neutral-content-strong">412</text>
            <text size="small" color="neutral-content-weak">Items pending</text>
          </vstack>
          <vstack grow padding="medium" cornerRadius="medium" borderColor="neutral-border" border="thick" backgroundColor="neutral-background">
            <hstack alignment="middle">
              <text size="small" weight="bold" color="neutral-content-weak">TOXICITY</text>
              <spacer grow />
              <text size="small" color="neutral-content-weak">-14%</text>
            </hstack>
            <text size="xxlarge" weight="bold" color="neutral-content-strong">0.12</text>
            <text size="small" color="neutral-content-weak">Avg Score</text>
          </vstack>
        </hstack>

        <vstack padding="medium" cornerRadius="medium" borderColor="neutral-border" border="thick" backgroundColor="neutral-background" gap="small">
          <hstack gap="small" alignment="middle">
            <icon name="bot" color="neutral-content-weak" />
            <text weight="bold" color="neutral-content-strong">AUTOMOD LOAD</text>
          </hstack>
          <hstack alignment="middle" padding="small" border="thick" borderColor="neutral-border">
            <text color="neutral-content-strong">Filter Efficiency</text>
            <spacer grow />
            <text weight="bold" color="primary-background">94.2%</text>
          </hstack>
          <hstack alignment="middle" padding="small" border="thick" borderColor="neutral-border">
            <text color="neutral-content-strong">False Positive Risk</text>
            <spacer grow />
            <text weight="bold" color="neutral-content-strong">Low (1.4%)</text>
          </hstack>
          <hstack alignment="middle" padding="small">
            <text size="small" color="neutral-content-weak">1,249 actions today</text>
            <spacer grow />
            <hstack padding="small" cornerRadius="small" backgroundColor="neutral-background-weak" border="thick" borderColor="neutral-border">
              <text size="small" weight="bold" color="neutral-content-strong">AUDIT LOGS</text>
            </hstack>
          </hstack>
        </vstack>

        <vstack padding="medium" cornerRadius="medium" borderColor="neutral-border" border="thick" backgroundColor="neutral-background" gap="small">
          <hstack alignment="middle">
            <hstack gap="small" alignment="middle">
              <icon name="community" color="neutral-content-weak" />
              <text weight="bold" color="neutral-content-strong">MEMBER INFLUX</text>
            </hstack>
            <spacer grow />
            <text color="neutral-content-strong">+2,401 24h</text>
          </hstack>
          {/* Simulated Bar Chart */}
          <hstack gap="small" alignment="bottom" height="40px">
            <hstack grow backgroundColor="primary-background-weak" height="20%" />
            <hstack grow backgroundColor="primary-background-weak" height="30%" />
            <hstack grow backgroundColor="primary-background-weak" height="40%" />
            <hstack grow backgroundColor="primary-background-weak" height="60%" />
            <hstack grow backgroundColor="primary-background-weak" height="50%" />
            <hstack grow backgroundColor="primary-background" height="100%" />
          </hstack>
        </vstack>

      </vstack>
    </vstack>
  );
};
