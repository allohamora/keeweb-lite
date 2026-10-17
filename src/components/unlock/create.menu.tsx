import { ProviderActionMenu } from './provider-action-menu';

type CreateMenuProps = {
  onRecordCreated: () => void;
};

export const CreateMenu = ({ onRecordCreated }: CreateMenuProps) => {
  return <ProviderActionMenu action="create" onComplete={onRecordCreated} />;
};
