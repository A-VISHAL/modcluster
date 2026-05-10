import { Devvit } from '@devvit/public-api';

export const JuryScreen = () => {
  return (
    <vstack width="100%" grow backgroundColor="neutral-background-weak">
      <hstack padding="medium" alignment="middle" borderColor="neutral-border">
        <text size="large" weight="bold" color="neutral-content-strong">Priority 1 Case #0021-J</text>
        <spacer grow />
        <text color="neutral-content-weak" size="small">24m remaining</text>
      </hstack>

      <vstack padding="medium" gap="medium" grow>
        <text size="xlarge" weight="bold" color="neutral-content-strong">Harassment & Targeted Brigading</text>

        <text size="small" weight="bold" color="neutral-content-weak">FLAGGED EVIDENCE</text>
        <vstack padding="medium" cornerRadius="medium" borderColor="neutral-border" border="thick" backgroundColor="neutral-background" gap="small">
          <hstack gap="small">
            <text weight="bold" color="neutral-content-strong">u/User8823</text>
            <text color="neutral-content-weak">• 4h ago</text>
          </hstack>
          <text color="neutral-content-strong">"This entire sub-community is a complete joke. We need to start coordinating more effectively to shut down these threads before they even gain traction. Link below for the private Discord where we organize the 'cleanup' squads."</text>
          <hstack padding="small" cornerRadius="small" backgroundColor="neutral-background-weak" alignment="middle" gap="small" border="thick" borderColor="neutral-border">
            <icon name="link" color="neutral-content-weak" size="small" />
            <text color="neutral-content-strong" size="small">discord.gg/invites/cleanup-ops-alpha-7...</text>
            <spacer grow />
            <icon name="external-outline" color="neutral-content-weak" size="small" />
          </hstack>
        </vstack>

        <vstack padding="small">
          <text size="small" weight="bold" color="neutral-content-weak">CONSENSUS</text>
        </vstack>
        
        <hstack padding="medium" cornerRadius="medium" borderColor="neutral-border" border="thick" backgroundColor="neutral-background" alignment="middle">
          <hstack gap="small">
            <text color="neutral-content-weak">Verdict:</text>
            <text weight="bold" color="primary-background">GUILTY</text>
          </hstack>
          <spacer grow />
          <text size="small" color="neutral-content-weak">82% Agreement (7/12 Votes)</text>
        </hstack>

        <vstack padding="small">
          <text size="small" weight="bold" color="neutral-content-weak">DELIBERATION</text>
        </vstack>
        <vstack gap="small">
          <hstack gap="small">
            <icon name="user" color="neutral-content-weak" />
            <vstack grow gap="none">
              <hstack gap="small" alignment="middle">
                <text weight="bold" color="neutral-content-strong" size="small">Juror_Alpha</text>
                <hstack backgroundColor="primary-background-weak" cornerRadius="small" padding="xsmall">
                  <text size="small" color="primary-background" weight="bold">VOTED GUILTY</text>
                </hstack>
              </hstack>
              <text color="neutral-content-strong" size="small">Explicit call for brigading and external coordination. Clear violation of Community Health rules Section 4.2.</text>
            </vstack>
          </hstack>
          <hstack gap="large">
            <spacer size="medium" />
            <icon name="user" color="neutral-content-weak" />
            <vstack grow gap="none">
              <hstack gap="small" alignment="middle">
                <text weight="bold" color="neutral-content-strong" size="small">Mod_Gamma</text>
                <hstack backgroundColor="primary-background-weak" cornerRadius="small" padding="xsmall">
                  <text size="small" color="primary-background" weight="bold">VOTED GUILTY</text>
                </hstack>
              </hstack>
              <text color="neutral-content-strong" size="small">Agreed. The Discord link provided in the post was verified by secondary screening as a known coordination hub.</text>
            </vstack>
          </hstack>
        </vstack>

        <vstack padding="small">
          <text color="primary-background" size="small" weight="bold">4 more deliberation comments...</text>
        </vstack>

        <vstack padding="small">
          <text size="small" weight="bold" color="neutral-content-weak">RULE REFERENCES</text>
        </vstack>
        
        <hstack gap="small">
          <vstack grow padding="small" cornerRadius="small" borderColor="neutral-border" border="thick" backgroundColor="neutral-background">
            <text size="small" weight="bold" color="neutral-content-strong">R4.2: Brigading</text>
            <text size="small" color="neutral-content-weak">Prohibits organizing user actions to disrupt other threads.</text>
          </vstack>
          <vstack grow padding="small" cornerRadius="small" borderColor="neutral-border" border="thick" backgroundColor="neutral-background">
            <text size="small" weight="bold" color="neutral-content-strong">R1.1: Harassment</text>
            <text size="small" color="neutral-content-weak">Prohibits targeted attacks against specific user groups.</text>
          </vstack>
        </hstack>

        <vstack padding="medium">
          <hstack gap="medium">
            <hstack grow padding="medium" cornerRadius="full" borderColor="neutral-border" border="thick" backgroundColor="neutral-background" alignment="center middle">
              <text weight="bold" color="neutral-content-strong">DISMISS CASE</text>
            </hstack>
            <hstack grow padding="medium" cornerRadius="full" backgroundColor="primary-background" alignment="center middle">
              <text weight="bold" color="white">CONFIRM BAN</text>
            </hstack>
          </hstack>
        </vstack>

      </vstack>
    </vstack>
  );
};
