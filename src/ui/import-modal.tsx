import { ImportFlow } from './import-flow.tsx'
import { Modal } from './modal.tsx'
import { strings } from './strings.ts'

export function ImportModal({ update, onClose }: { update?: boolean; onClose: () => void }) {
  return (
    <Modal
      title={update ? strings.sidebar.updateFromLichess : strings.sidebar.importMore}
      onClose={onClose}
    >
      <ImportFlow update={update} />
    </Modal>
  )
}
