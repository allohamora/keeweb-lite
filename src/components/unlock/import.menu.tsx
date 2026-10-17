import { ProviderActionMenu } from './provider-action-menu';

type ImportMenuProps = {
  onRecordImported: () => void;
};

export const ImportMenu = ({ onRecordImported }: ImportMenuProps) => {
  return <ProviderActionMenu action="import" onComplete={onRecordImported} />;
};
