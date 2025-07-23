import { DownOutlined, FieldTimeOutlined, SaveOutlined, BranchesOutlined, RollbackOutlined, EyeOutlined, DeleteOutlined } from "@ant-design/icons";
import type { MenuProps } from "antd";
import { Button, Dropdown, Space, Modal, Input, message, Popconfirm, Badge, Tooltip, Tag, Divider } from "antd";
import { useState } from "react";
import useAppStore from "../store/store"; 
const { TextArea } = Input;

function VersionControlButton() {
  const [isCommitModalVisible, setIsCommitModalVisible] = useState(false);
  const [isVersionHistoryVisible, setIsVersionHistoryVisible] = useState(false);
  const [commitDescription, setCommitDescription] = useState('');  
  const {
    versions,
    commitCurrentChanges,
    revertToVersion,
    createBranchFromVersion,
    deleteVersion,
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
    // Extract a more unique hash from the version ID
    const parts = versionId.split('_');
    if (parts.length >= 3) {
      // Use counter + timestamp for uniqueness
      return `${parts[1]}.${parts[2].substring(0, 4)}`;
    }
    return versionId.substring(0, 8);
  };

  const getComponentTypeColor = (componentType: string) => {
    switch (componentType) {
      case 'templateMarkdown': return '#52c41a';
      case 'modelCto': return '#1890ff';
      case 'data': return '#fa8c16';
      default: return '#666';
    }
  };

  const getComponentTypeName = (componentType: string) => {
    switch (componentType) {
      case 'templateMarkdown': return 'Template';
      case 'modelCto': return 'Model';
      case 'data': return 'Data';
      default: return componentType;
    }
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

  const handleDeleteVersion = (versionId: string) => {
    try {
      const success = deleteVersion(versionId);
      if (success) {
        message.success('Version deleted successfully');
      } else {
        message.error('Failed to delete version');
      }
    } catch (error) {
      message.error('Failed to delete version');
      console.error('Delete error:', error);
    }
  };

  // Group versions by component type for better organization
  const groupedVersions = versions.reduce((acc, version) => {
    if (!acc[version.componentType]) {
      acc[version.componentType] = [];
    }
    acc[version.componentType].push(version);
    return acc;
  }, {} as Record<string, typeof versions>);

  const items: MenuProps["items"] = [];

  // Add recent versions (last 5)
  const recentVersions = versions.slice(0, 5);
  if (recentVersions.length > 0) {
    items.push(
      {
        key: 'recent-header',
        label: <strong>Recent Changes</strong>,
        disabled: true,
      },
      ...recentVersions.map((version) => ({
        key: version.id,
        label: (
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', minWidth: 280 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Tag color={getComponentTypeColor(version.componentType)}>
                {getComponentTypeName(version.componentType)}
              </Tag>
              <span style={{ fontWeight: 500 }}>#{getVersionHash(version.id)}</span>
              <span style={{ fontSize: '12px', color: '#666', maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {version.changeDescription || 'No description'}
              </span>
            </div>
            <span style={{ opacity: 0.6, fontSize: '11px' }}>
              <FieldTimeOutlined /> {formatTimeAgo(version.timestamp)}
            </span>
          </div>
        ),
      }))
    );
  }

  if (versions.length > 0) {
    items.push(
      { type: 'divider' },
      {
        key: 'view-all',
        label: (
          <div style={{ textAlign: 'center', padding: '4px 0' }}>
            <Button type="link" size="small" icon={<EyeOutlined />}>
              View All Versions ({versions.length})
            </Button>
          </div>
        ),
        onClick: () => setIsVersionHistoryVisible(true),
      },
      { type: 'divider' },
      {
        key: 'revert',
        label: 'Revert to Version',
        icon: <RollbackOutlined />,
        children: versions.slice(0, 10).map((version) => ({
          key: `revert-${version.id}`,
          label: (
            <Popconfirm
              title="Are you sure you want to revert to this version?"
              description="This will create a new version with the selected content."
              onConfirm={() => handleRevert(version.id)}
              okText="Yes"
              cancelText="No"
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', minWidth: 200 }}>
                <div>
                  <Tag color={getComponentTypeColor(version.componentType)} >
                    {getComponentTypeName(version.componentType)}
                  </Tag>
                  #{getVersionHash(version.id)}
                </div>
                <span style={{ fontSize: '11px', opacity: 0.7 }}>
                  {formatTimeAgo(version.timestamp)}
                </span>
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
        <Dropdown menu={{ items }} disabled={versions.length === 0} placement="bottomRight">
          <Button>
            <Space>
              Timeline
              <Badge count={versions.length} size="small" />
              <DownOutlined />
            </Space>
          </Button>
        </Dropdown>
        
        <Tooltip title="Save current changes as a new version">
          <Button 
            type="primary" 
            icon={<SaveOutlined />}
            onClick={() => setIsCommitModalVisible(true)}
          >
            Commit
          </Button>
        </Tooltip>
      </Space>

      {/* Commit Modal */}
      <Modal
        title={
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <SaveOutlined />
            Commit Changes
          </div>
        }
        open={isCommitModalVisible}
        onOk={handleCommit}
        onCancel={() => {
          setIsCommitModalVisible(false);
          setCommitDescription('');
        }}
        okText="Commit"
        cancelText="Cancel"
        width={500}
      >
        <div style={{ marginBottom: 16 }}>
          <p style={{ marginBottom: 8, fontWeight: 500 }}>Describe the changes you've made:</p>
          <TextArea
            placeholder="e.g., Updated template structure, Fixed model validation, Added new data fields..."
            value={commitDescription}
            onChange={(e) => setCommitDescription(e.target.value)}
            rows={4}
            showCount
            maxLength={500}
          />
          <div style={{ marginTop: 8, fontSize: '12px', color: '#666' }}>
            💡 Tip: Good commit messages help you track changes over time
          </div>
        </div>
      </Modal>

      {/* Version History Modal */}
      <Modal
        title={
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <BranchesOutlined />
            Version History ({versions.length} versions)
          </div>
        }
        open={isVersionHistoryVisible}
        onCancel={() => setIsVersionHistoryVisible(false)}
        footer={null}
        width={700}
      >
        <div style={{ maxHeight: 500, overflowY: 'auto' }}>
          {Object.entries(groupedVersions).map(([componentType, componentVersions]) => (
            <div key={componentType} style={{ marginBottom: 24 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                <Tag color={getComponentTypeColor(componentType)}>
                  {getComponentTypeName(componentType)}
                </Tag>
                <span style={{ fontSize: '14px', color: '#666' }}>
                  {componentVersions.length} versions
                </span>
              </div>
              
              {componentVersions.map((version, index) => (
                <div key={version.id} style={{ 
                  display: 'flex', 
                  alignItems: 'center', 
                  justifyContent: 'space-between',
                  padding: '8px 12px',
                  border: '1px solid #f0f0f0',
                  borderRadius: '6px',
                  marginBottom: '8px',
                  backgroundColor: index === 0 ? '#f6ffed' : 'white'
                }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                      <span style={{ fontWeight: 500, fontSize: '13px' }}>
                        #{getVersionHash(version.id)}
                      </span>
                      {index === 0 && (
                        <Tag color="green" >Latest</Tag>
                      )}
                      <span style={{ fontSize: '11px', color: '#666' }}>
                        by {version.author.name}
                      </span>
                      <span style={{ fontSize: '11px', color: '#999' }}>
                        {formatTimeAgo(version.timestamp)}
                      </span>
                    </div>
                    <div style={{ fontSize: '12px', color: '#666' }}>
                      {version.changeDescription || 'No description'}
                    </div>
                  </div>
                  
                  <Space>
                    <Tooltip title="Revert to this version">
                      <Popconfirm
                        title="Revert to this version?"
                        onConfirm={() => handleRevert(version.id)}
                        okText="Yes"
                        cancelText="No"
                      >
                        <Button size="small" icon={<RollbackOutlined />} />
                      </Popconfirm>
                    </Tooltip>
                    
                    <Tooltip title="Delete this version">
                      <Popconfirm
                        title="Delete this version?"
                        description="This action cannot be undone."
                        onConfirm={() => handleDeleteVersion(version.id)}
                        okText="Delete"
                        cancelText="Cancel"
                        okButtonProps={{ danger: true }}
                      >
                        <Button size="small" danger icon={<DeleteOutlined />} />
                      </Popconfirm>
                    </Tooltip>
                  </Space>
                </div>
              ))}
            </div>
          ))}
          
          {versions.length === 0 && (
            <div style={{ textAlign: 'center', padding: '40px 0', color: '#666' }}>
              <BranchesOutlined style={{ fontSize: '24px', marginBottom: '8px' }} />
              <div>No versions yet</div>
              <div style={{ fontSize: '12px' }}>Make some changes and commit them to see version history</div>
            </div>
          )}
        </div>
      </Modal>
    </>
  );
}

export default VersionControlButton;