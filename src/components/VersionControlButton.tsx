import { DownOutlined, FieldTimeOutlined } from "@ant-design/icons";
import type { MenuProps } from "antd";
import { Button, Dropdown, Space } from "antd";

function VersionControlButton() {
  const items: MenuProps["items"] = [
    {
    key: '1',
    label: (
      <div style={{ display: 'flex', justifyContent: 'space-between', width: 150 }}>
        <span>Version#664</span>
        <span style={{ opacity: 0.6 }}><FieldTimeOutlined /> 6h ago</span>
      </div>
    ),
  },
  ];
  return (
    <Space>
      <Dropdown menu={{items}}>
        <Button>
            Timeline
            <DownOutlined />
        </Button>
      </Dropdown>
    </Space>
  );
}

export default VersionControlButton;