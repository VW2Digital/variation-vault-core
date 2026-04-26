import SettingsHeader from '@/components/admin/settings/SettingsHeader';

interface SettingsBackButtonProps {
  title: string;
  description?: string;
}

/**
 * Thin wrapper around SettingsHeader kept for backwards compatibility
 * with existing settings pages. New code should import SettingsHeader directly.
 */
const SettingsBackButton = ({ title, description }: SettingsBackButtonProps) => (
  <SettingsHeader title={title} description={description} action="back" />
);

export default SettingsBackButton;
