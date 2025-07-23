import { DownOutlined, FieldTimeOutlined, SaveOutlined, BranchesOutlined, RollbackOutlined } from "@ant-design/icons";
import type { MenuProps } from "antd";
import { Button, Dropdown, Space, Modal, Input, message, Popconfirm } from "antd";
import { useState } from "react";
import useAppStore from "../store/store"; 
const { TextArea } = Input;

function VersionControlButton() {
  const [isCommitModalVisible, setIsCommitModalVisible] = useState(false);
  const [commitDescription, setCommitDescription] = useState('');  
  const {
    versions,
    commitCurrentChanges,
    revertToVersion,
    createBranchFromVersion,
  } = useAppStore();

  const formatTimeAgo = (timestamp: string) => {
    const now = Date.now();
    const timestampMs = new Date(timestamp).getTime();
    const diff = now - timestampMs;
    const minutes = Math.floor(diff / (1000 * 60));
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    
    if (days > 0) return `${days}d ago`;
    if (hours > 0) return `${hours}h ago`;
    if (minutes > 0) return `${minutes}m ago`;
    return 'Just now';
  };

  const getVersionHash = (versionId: string) => {
    return versionId.substring(0, 7);
  };

  const handleRevert = async (versionId: string) => {
    try {
      await revertToVersion(versionId);
      message.success('Successfully reverted to selected version');
    } catch (error) {
      message.error('Failed to revert to version');
      console.error('Revert error:', error);
    }
  };

  const handleCommit = () => {
    try {
      commitCurrentChanges(commitDescription.trim() || undefined);
      message.success('Changes committed successfully');
      setCommitDescription('');
      setIsCommitModalVisible(false);
    } catch (error) {
      message.error('Failed to commit changes');
      console.error('Commit error:', error);
    }
  };

  const items: MenuProps["items"] = versions.map((version) => ({
    key: version.id,
    label: (
      <div style={{ display: 'flex', justifyContent: 'space-between', width: 200 }}>
        <span>#{getVersionHash(version.id)}</span>
        <span style={{ opacity: 0.6 }}>
          <FieldTimeOutlined /> {formatTimeAgo(version.timestamp)}
        </span>
      </div>
    ),
  }));

  if (versions.length > 0) {
    items.push(
      { type: 'divider' },
      {
        key: 'revert',
        label: 'Revert to Version',
        icon: <RollbackOutlined />,
        children: versions.map((version) => ({
          key: `revert-${version.id}`,
          label: (
            <Popconfirm
              title="Are you sure you want to revert to this version?"
              onConfirm={() => handleRevert(version.id)}
              okText="Yes"
              cancelText="No"
            >
              <div>
                #{getVersionHash(version.id)} - {version.changeDescription || 'No description'}
              </div>
            </Popconfirm>
          ),
        }))
      }
    );
  }

  return (
    <>
      <Space>
        <Dropdown menu={{ items }} disabled={versions.length === 0}>
          <Button>
            Timeline ({versions.length})
            <DownOutlined />
          </Button>
        </Dropdown>
        
        <Button 
          type="primary" 
          icon={<SaveOutlined />}
          onClick={() => setIsCommitModalVisible(true)}
        >
          Commit
        </Button>
      </Space>

      {/* Commit Modal */}
      <Modal
        title="Commit Changes"
        open={isCommitModalVisible}
        onOk={handleCommit}
        onCancel={() => {
          setIsCommitModalVisible(false);
          setCommitDescription('');
        }}
        okText="Commit"
        cancelText="Cancel"
      >
        <div style={{ marginBottom: 16 }}>
          <p>Describe the changes you've made:</p>
          <TextArea
            placeholder="Enter commit description (optional)..."
            value={commitDescription}
            onChange={(e) => setCommitDescription(e.target.value)}
            rows={4}
            showCount
            maxLength={500}
          />
        </div>
      </Modal>
    </>
  );
}

export default VersionControlButton;