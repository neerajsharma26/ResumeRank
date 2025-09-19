import Image from 'next/image';
import * as React from 'react';

export const Logo = ({ className }: { className?: string }) => (
    <Image src="/images/varahe-logo.png" alt="Hire Varahe Logo" width={100} height={100} className={className} />
);
