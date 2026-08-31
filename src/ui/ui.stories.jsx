import React from 'react';
import { Eye } from 'lucide-react';
import { Button, StatusMessage, TextInput } from './index';

const meta = {
  title: 'Foundation/Controls',
  parameters: { layout: 'centered' },
  tags: ['autodocs'],
};

export default meta;

export const Buttons = {
  render: () => (
    <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
      <Button>Primary action</Button>
      <Button variant="secondary">Secondary action</Button>
      <Button variant="ghost">Quiet action</Button>
    </div>
  ),
};

export const Fields = {
  render: () => (
    <div style={{ width: 320, display: 'grid', gap: 16 }}>
      <TextInput label="Email address" placeholder="name@example.com" type="email" />
      <TextInput label="Password" type="password" trailing={<button className="ui-input-action" type="button" aria-label="Show password"><Eye size={17} /></button>} />
      <StatusMessage type="success">Your changes have been saved.</StatusMessage>
    </div>
  ),
};
