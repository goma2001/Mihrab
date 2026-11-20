/** Settings → Updates. Check GitHub Releases, update from inside the app. */
import { UpdatesCard } from '../UpdatesCard';
import { SettingsPage } from '../SettingsPage';

export function UpdatesSettingsScreen() {
  return (
    <SettingsPage>
      <UpdatesCard />
    </SettingsPage>
  );
}
