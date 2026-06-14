import React from 'react';

interface OrganizationHubIconProps {
  className?: string;
  height?: string | number;
  width?: string | number;
}

const OrganizationHubIcon: React.FC<OrganizationHubIconProps> = ({ className, height = "1em", width = "1em" }) => (
  <svg
    stroke="currentColor"
    fill="none"
    strokeWidth="2"
    viewBox="0 0 32 32"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
    height={height}
    width={width}
    xmlns="http://www.w3.org/2000/svg"
  >
    <polygon points="16,4 1,12 16,20 31,12" />
    <path d="M7,15.2V22c0,2.2,4,5,9,5c5,0,9-2.8,9-5v-6.8" />
    <line x1="31" y1="12" x2="31" y2="25" />
  </svg>
);

export default OrganizationHubIcon;
